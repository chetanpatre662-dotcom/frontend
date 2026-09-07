/**
 * services/urlFetchService.js
 * -----------------------------------------------------------------------------
 * SSRF-hardened outbound URL fetcher for the multimodal content pipeline. Used
 * ONLY when an admin explicitly provides a URL (timetable/document link). It is
 * deliberately NOT a general web crawler.
 *
 * Defense in depth (ALL enforced):
 *   - HTTPS only (http:// is refused).
 *   - DNS is resolved and EVERY resolved address is checked; the request is
 *     refused if ANY address is loopback / private / link-local / unique-local /
 *     a cloud metadata endpoint (169.254.169.254, fd00:ec2::254, etc.).
 *   - Redirects are followed manually (max 3) and EACH hop is re-validated
 *     (host + resolved IPs) so a redirect from a public page to an internal
 *     address is refused (redirect-to-internal hole closed).
 *   - Embedded credentials (userinfo) and non-443 ports are refused.
 *   - Hard timeout (AbortController) + maximum response size (streamed cap).
 *   - Content-Type allowlist (PDF / plain text / html / common images).
 *
 * KNOWN RESIDUAL RISK (documented, not hidden): DNS-rebinding TOCTOU. We resolve
 * + validate the host, but Node's global fetch resolves DNS again when it opens
 * the socket. A hostile authoritative DNS server could return a public IP to our
 * check and a private IP to the connection. Fully closing this requires pinning
 * the validated IP into the socket (a custom undici dispatcher / lookup), which
 * is not available without adding a dependency. This endpoint is ADMIN-ONLY, so
 * the attacker would already need admin credentials; the remaining exposure is
 * an admin being tricked into pasting a malicious rebinding URL. Treat that as a
 * follow-up hardening item if outbound fetch is ever exposed to non-admins.
 *
 * Returns { ok, buffer?, mimeType?, finalUrl?, bytes? } or throws ApiError with
 * a client-safe message (never leaks internal host/IP detail to the model).
 * -----------------------------------------------------------------------------
 */
'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const ApiError = require('../utils/ApiError');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB cap for fetched remote content
const MAX_REDIRECTS = 3;

// Content types we will accept from a remote URL (mirrors the ingest pipeline).
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/html',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
];

/** True if an IPv4 string is in a blocked (non-public) range. */
function isBlockedIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                         // 0.0.0.0/8 "this host"
  if (a === 10) return true;                        // 10/8 private
  if (a === 127) return true;                       // 127/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true;          // 169.254/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true;          // 192.168/16 private
  if (a === 192 && b === 0) return true;            // 192.0.0/24 & 192.0.2/24 special
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true;                        // multicast + reserved
  return false;
}

/** True if an IPv6 string is in a blocked (non-public) range. */
function isBlockedIPv6(ip) {
  const s = ip.toLowerCase().split('%')[0]; // drop zone id
  if (s === '::1' || s === '::') return true;       // loopback / unspecified
  // Link-local fe80::/10 spans fe80..febf. Match the first hextet numerically.
  const firstHextet = parseInt(s.split(':')[0] || '0', 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique-local (fc00::/7) incl fd00:ec2::254 metadata
  if (s.startsWith('ff')) return true;              // multicast
  // Any embedded IPv4 (::ffff:a.b.c.d mapped, ::a.b.c.d compat, 64:ff9b: NAT64,
  // 2002:xxxx:xxxx 6to4) — extract the dotted quad if present and re-check it.
  const mapped = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(s);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

/** True if a resolved address is unsafe to connect to. */
function isBlockedAddress(ip) {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIPv4(ip);
  if (type === 6) return isBlockedIPv6(ip);
  return true; // not a valid IP literal -> refuse
}

/**
 * Parse + validate a URL and resolve its host to public IPs. Throws ApiError on
 * any unsafe condition. Returns { url, hostname }.
 */
async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new ApiError(400, 'That does not look like a valid URL.', { code: 'URL_INVALID' });
  }
  if (u.protocol !== 'https:') {
    throw new ApiError(400, 'Only secure https:// links are supported.', { code: 'URL_NOT_HTTPS' });
  }
  // Reject embedded credentials (https://user:pass@host / https://a@b tricks).
  if (u.username || u.password) {
    throw new ApiError(400, 'Links with embedded credentials are not allowed.', { code: 'URL_HAS_USERINFO' });
  }
  // Only the default HTTPS port (443) is allowed — no targeting internal ports.
  if (u.port && u.port !== '443') {
    throw new ApiError(400, 'Only the standard https port (443) is supported.', { code: 'URL_BAD_PORT' });
  }
  const host = u.hostname.toLowerCase();
  // Reject obvious local names + raw literals up front.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ApiError(400, 'That link points to a local address and cannot be fetched.', { code: 'URL_BLOCKED' });
  }
  // If the host is already an IP literal, check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new ApiError(400, 'That link points to a private address and cannot be fetched.', { code: 'URL_BLOCKED' });
    }
    return { url: u, hostname: host };
  }
  // Otherwise resolve DNS and check EVERY address.
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new ApiError(400, 'That link could not be resolved.', { code: 'URL_DNS_FAILED' });
  }
  if (!addrs.length) throw new ApiError(400, 'That link could not be resolved.', { code: 'URL_DNS_FAILED' });
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) {
      throw new ApiError(400, 'That link points to a private or internal address and cannot be fetched.', { code: 'URL_BLOCKED' });
    }
  }
  return { url: u, hostname: host };
}

/** Read a fetch Response body with a hard byte cap. */
async function readCapped(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    // Fallback: arrayBuffer (still capped after the fact).
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      throw new ApiError(413, 'The linked content is too large to process.', { code: 'URL_TOO_LARGE' });
    }
    return Buffer.from(ab);
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new ApiError(413, 'The linked content is too large to process.', { code: 'URL_TOO_LARGE' });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Safely fetch a remote URL. Follows up to MAX_REDIRECTS redirects, re-validating
 * each hop. Enforces timeout, size cap, and a content-type allowlist.
 *
 * @param {string} rawUrl
 * @param {object} [opts] { timeoutMs?, allowedTypes? }
 * @returns {Promise<{ ok:true, buffer:Buffer, mimeType:string, finalUrl:string, bytes:number }>}
 */
async function fetchSafely(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, allowedTypes = ALLOWED_CONTENT_TYPES } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { url } = await assertSafeUrl(current); // re-validates each hop (anti-rebind)

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'manual', // we follow + re-validate manually
        signal: controller.signal,
        headers: { 'User-Agent': 'AskbookBot/1.0 (+content-ingest)', Accept: allowedTypes.join(',') },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new ApiError(504, 'The link took too long to respond.', { code: 'URL_TIMEOUT' });
      }
      throw new ApiError(502, 'Could not fetch the linked content.', { code: 'URL_FETCH_FAILED' });
    }
    clearTimeout(timer);

    // Manual redirect handling with per-hop revalidation.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new ApiError(502, 'The link redirected without a destination.', { code: 'URL_BAD_REDIRECT' });
      current = new URL(loc, url).toString();
      if (hop === MAX_REDIRECTS) {
        throw new ApiError(502, 'The link redirected too many times.', { code: 'URL_TOO_MANY_REDIRECTS' });
      }
      continue;
    }

    if (!res.ok) {
      throw new ApiError(502, 'The linked content could not be retrieved.', { code: 'URL_HTTP_ERROR' });
    }

    const ct = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !allowedTypes.includes(ct)) {
      throw new ApiError(415, 'That link type is not supported for processing.', { code: 'URL_UNSUPPORTED_TYPE' });
    }

    const buffer = await readCapped(res);
    return { ok: true, buffer, mimeType: ct || 'application/octet-stream', finalUrl: url.toString(), bytes: buffer.length };
  }
  // Unreachable, but keep the contract explicit.
  throw new ApiError(502, 'The link could not be processed.', { code: 'URL_FETCH_FAILED' });
}

module.exports = {
  fetchSafely,
  assertSafeUrl,
  // exported for unit testing the SSRF guard without network I/O
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedAddress,
  ALLOWED_CONTENT_TYPES,
  MAX_BYTES,
};
