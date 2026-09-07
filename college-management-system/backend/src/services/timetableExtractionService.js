/**
 * services/timetableExtractionService.js
 * -----------------------------------------------------------------------------
 * Turns an admin-provided timetable (image / PDF / plain text / URL) into a
 * STRUCTURED DRAFT of entries for the admin review screen. It NEVER publishes —
 * it only returns a draft that the admin edits/confirms before saveTimetable().
 *
 * Reuses existing infrastructure (no duplicate AI/RAG system):
 *   - geminiService.generate(...) with a vision (inlineData) part for images and
 *     scanned/image PDFs; also for parsing messy plain text into rows.
 *   - embeddingService.extractText(...) for text-based PDFs (pdf-parse) + TXT.
 *   - urlFetchService.fetchSafely(...) (SSRF-safe) for URL inputs, then routed
 *     through the same image/PDF/text path by content-type.
 *   - timetableService.prepareDraft(...) for validation + subject matching +
 *     conflict detection.
 *
 * Honesty: when Gemini is not configured, image/scanned-PDF extraction returns a
 * clear "extraction unavailable" result instead of inventing entries. Plain text
 * still has a deterministic non-AI line parser fallback so text timetables work
 * even without a key.
 * -----------------------------------------------------------------------------
 */
'use strict';

const geminiService = require('./geminiService');
const embeddingService = require('./embeddingService');
const urlFetchService = require('./urlFetchService');
const timetableService = require('./timetableService');

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** The instruction we give Gemini to return STRICT JSON (no prose, no invention). */
const EXTRACTION_SYSTEM = [
  'You extract weekly class timetables into strict JSON. Return ONLY a JSON array.',
  'Each element: {"day":"Monday","start":"09:30","end":"10:30","subject":"Data Structures","code":"CS201","faculty":"","room":""}.',
  'Use 24-hour HH:MM times. day must be a weekday name. Only include cells you can actually read.',
  'If a field is not present, use an empty string — NEVER guess a subject, time, faculty or room.',
  'If you cannot read a timetable at all, return [].',
].join(' ');

/** Best-effort parse of a model reply into an array of raw row objects. */
function parseModelJson(text) {
  if (!text) return [];
  let s = String(text).trim();
  // Strip ```json fences if present.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  // Find the first JSON array in the string.
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Deterministic (no-AI) parser for plain-text timetables. Understands blocks
 * like:
 *   Monday
 *   9:30-10:30 Data Structures
 *   10:30-11:30 Maths
 * A bare weekday line sets the current day; a "TIME-TIME Subject" line is a row.
 */
function parseTextTimetable(text) {
  const rows = [];
  let currentDay = null;
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const dayOnly = timetableService.parseDay(line);
    // A short line that is purely a day name → set the current day.
    if (dayOnly != null && line.split(/\s+/).length <= 2 && !/\d/.test(line)) {
      currentDay = dayOnly;
      continue;
    }
    // "9:30-10:30 Subject" or "Mon 9:30-10:30 Subject".
    const m = /^(?:([A-Za-z]+)\s+)?(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)\s+(.+)$/i.exec(line);
    if (m) {
      const inlineDay = m[1] ? timetableService.parseDay(m[1]) : null;
      const day = inlineDay != null ? inlineDay : currentDay;
      const start = timetableService.parseTime(m[2]);
      const end = timetableService.parseTime(m[3]);
      const rest = m[4].trim();
      if (day != null && start && end && rest) {
        rows.push({ day, start, end, subject: rest });
      }
    }
  }
  return rows;
}

/** Extract raw rows from an IMAGE buffer via Gemini vision. */
async function extractFromImage(buffer, mimeType) {
  if (!geminiService.isEnabled()) {
    return { rows: [], note: 'Image extraction needs the AI service, which is not configured on this server.' };
  }
  const contents = [{
    role: 'user',
    parts: [
      { text: 'Extract this timetable image into the required JSON array.' },
      { inlineData: { mimeType, data: buffer.toString('base64') } },
    ],
  }];
  const res = await geminiService.generate({ system: EXTRACTION_SYSTEM, contents });
  return { rows: parseModelJson(res.text), note: null };
}

/**
 * Extract raw rows from a PDF buffer. Text-based PDFs go through pdf-parse; if
 * that yields little/no text (scanned PDF) AND Gemini is available, fall back to
 * vision on the raw PDF bytes. Never fabricates.
 */
async function extractFromPdf(buffer, mimeType) {
  let text = '';
  try {
    text = await embeddingService.extractText(buffer, 'application/pdf');
  } catch {
    text = '';
  }
  const clean = String(text || '').trim();
  if (clean.length >= 40) {
    // Text-based PDF: prefer AI structuring, else the deterministic parser.
    if (geminiService.isEnabled()) {
      const contents = [{ role: 'user', parts: [{ text: `Extract this timetable text into the required JSON array:\n\n${clean.slice(0, 12000)}` }] }];
      const res = await geminiService.generate({ system: EXTRACTION_SYSTEM, contents });
      const rows = parseModelJson(res.text);
      if (rows.length) return { rows, note: null };
    }
    const rows = parseTextTimetable(clean);
    return { rows, note: rows.length ? null : 'Could not detect timetable rows in the PDF text.' };
  }
  // Scanned/image PDF → vision (if available).
  if (geminiService.isEnabled()) {
    const contents = [{
      role: 'user',
      parts: [
        { text: 'This PDF is a scanned timetable. Extract it into the required JSON array.' },
        { inlineData: { mimeType: mimeType || 'application/pdf', data: buffer.toString('base64') } },
      ],
    }];
    const res = await geminiService.generate({ system: EXTRACTION_SYSTEM, contents });
    return { rows: parseModelJson(res.text), note: null };
  }
  return { rows: [], note: 'This looks like a scanned PDF; extracting it needs the AI service, which is not configured.' };
}

/** Extract raw rows from plain text (AI structuring with deterministic fallback). */
async function extractFromText(text) {
  const clean = String(text || '').trim();
  if (!clean) return { rows: [], note: 'No text was provided.' };
  if (geminiService.isEnabled()) {
    const contents = [{ role: 'user', parts: [{ text: `Extract this timetable text into the required JSON array:\n\n${clean.slice(0, 12000)}` }] }];
    try {
      const res = await geminiService.generate({ system: EXTRACTION_SYSTEM, contents });
      const rows = parseModelJson(res.text);
      if (rows.length) return { rows, note: null };
    } catch {
      /* fall through to deterministic parser */
    }
  }
  const rows = parseTextTimetable(clean);
  return { rows, note: rows.length ? null : 'Could not detect timetable rows in the text.' };
}

/** Fetch a URL safely, then route its bytes through the matching extractor. */
async function extractFromUrl(url) {
  const fetched = await urlFetchService.fetchSafely(url); // throws ApiError on unsafe/failed
  const mime = fetched.mimeType;
  if (IMAGE_MIME.has(mime)) return extractFromImage(fetched.buffer, mime);
  if (mime === 'application/pdf') return extractFromPdf(fetched.buffer, mime);
  if (mime === 'text/plain' || mime === 'text/html') {
    // For HTML, extract visible text crudely (strip tags) then parse.
    const raw = fetched.buffer.toString('utf8');
    const textish = mime === 'text/html' ? raw.replace(/<[^>]+>/g, ' ') : raw;
    return extractFromText(textish);
  }
  return { rows: [], note: 'The linked content type is not supported for timetable extraction.' };
}

/**
 * Top-level: extract a DRAFT timetable for a group from one input source.
 *
 * @param {object} p
 * @param {{program,branch,semester}} p.group
 * @param {'image'|'pdf'|'text'|'url'} p.inputType
 * @param {Buffer} [p.buffer]    for image/pdf
 * @param {string} [p.mimeType]  for image/pdf
 * @param {string} [p.text]      for text
 * @param {string} [p.url]       for url
 * @returns {Promise<object>} { group, sourceKind, entries, invalid, conflicts, subjects, note?, extractedCount }
 */
async function extractDraft({ group, inputType, buffer, mimeType, text, url }) {
  let raw = { rows: [], note: null };
  switch (inputType) {
    case 'image':
      if (!buffer || !IMAGE_MIME.has(mimeType)) return { error: 'A valid image (JPEG/PNG/WebP/GIF) is required.' };
      raw = await extractFromImage(buffer, mimeType);
      break;
    case 'pdf':
      if (!buffer) return { error: 'A PDF file is required.' };
      raw = await extractFromPdf(buffer, mimeType || 'application/pdf');
      break;
    case 'text':
      raw = await extractFromText(text);
      break;
    case 'url':
      raw = await extractFromUrl(url);
      break;
    default:
      return { error: 'inputType must be one of image, pdf, text, url.' };
  }

  const extractedCount = raw.rows.length;
  // Validate + match against real subjects (no save). prepareDraft validates the
  // group against the catalog and never auto-creates subjects.
  const draft = await timetableService.prepareDraft(group, raw.rows);
  return {
    ...draft,
    sourceKind: inputType,
    note: raw.note || (extractedCount === 0 ? 'No timetable rows could be extracted. You can add rows manually.' : null),
    extractedCount,
  };
}

module.exports = {
  extractDraft,
  // exported for unit tests (no network / no live AI needed)
  parseModelJson,
  parseTextTimetable,
  extractFromText,
  EXTRACTION_SYSTEM,
};
