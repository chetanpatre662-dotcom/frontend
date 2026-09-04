/**
 * apiClient.js — Backend seam (Phase 2 placeholder).
 *
 * In the mock phase this is unused, but it documents exactly where real HTTP
 * calls will go. Services already return Promises, so switching each service
 * from the mock branch to apiClient.request() is a localized change.
 *
 * Later this will attach the Firebase Auth token, handle 401 refresh, etc.
 */
import { ENV } from '../config.js';

/** Simulated network latency so loading states behave like production. */
export function latency(ms = ENV.SIMULATED_LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Placeholder request method for the general mock phase. Not called while
 * ENV.USE_MOCK is true — unrelated services still use their mock branches.
 * Kept as the single integration point for the broader Phase 2 migration.
 */
export async function request(path, { method = 'GET', body, headers } = {}) {
  if (ENV.USE_MOCK) {
    throw new Error('apiClient.request called while USE_MOCK is true — use a mock service instead.');
  }
  return rawRequest(path, { method, body, headers });
}

/**
 * Low-level fetch wrapper against the backend. Used by both request() and the
 * authenticated helper below. Throws an Error with `.status` and `.data` on
 * non-2xx so callers can inspect the response.
 */
async function rawRequest(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${ENV.API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }

  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Authenticated request: attaches `Authorization: Bearer <firebaseIdToken>`.
 *
 * This intentionally bypasses the ENV.USE_MOCK guard because authentication is
 * the ONE flow that talks to the real backend during this step (gated by
 * ENV.AUTH_USE_BACKEND). All other services remain on mock data.
 *
 * @param {string} path - path under ENV.API_BASE_URL (e.g. '/auth/sync')
 * @param {string} idToken - Firebase ID token (obtained from the Firebase user)
 * @param {object} [opts] - { method, body, headers }
 */
export async function authedRequest(path, idToken, { method = 'GET', body, headers } = {}) {
  if (!idToken) {
    const err = new Error('authedRequest called without a Firebase ID token.');
    err.status = 401;
    throw err;
  }
  return rawRequest(path, {
    method,
    body,
    headers: { Authorization: `Bearer ${idToken}`, ...headers },
  });
}
