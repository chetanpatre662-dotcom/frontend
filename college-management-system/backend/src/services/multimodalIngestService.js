/**
 * services/multimodalIngestService.js
 * -----------------------------------------------------------------------------
 * Multimodal content-understanding layer that feeds the EXISTING RAG index
 * (ai_document_chunks) — it does NOT create a second RAG system. It normalizes
 * any supported source into text, then reuses the same chunk/embed/upsert
 * primitives the document pipeline already uses.
 *
 *   Source (text | image | pdf | docx | url)
 *        -> normalizeToText(...)      (Gemini vision for images/scanned PDFs;
 *                                      pdf-parse/mammoth for text docs;
 *                                      SSRF-safe fetch for URLs)
 *        -> embeddingService.chunkText / hashChunk / embedChunks
 *        -> aiRepository.upsertChunk(...)  (scope + source metadata preserved)
 *
 * Source tracking + metadata: every chunk carries source_type, source_id,
 * title, class scope (program/branch/semester or public), and file_id when it
 * came from a stored file. No page numbers / URLs are invented — only what we
 * actually have is stored.
 *
 * HONESTY: when Gemini is not configured, image / scanned-PDF understanding is
 * unavailable and returns status:'skipped' with a clear reason instead of
 * fabricating text. Text/PDF-text/DOCX still work with a key present.
 * -----------------------------------------------------------------------------
 */
'use strict';

const aiRepository = require('../repositories/aiRepository');
const embeddingService = require('./embeddingService');
const geminiService = require('./geminiService');
const urlFetchService = require('./urlFetchService');

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const VISION_SYSTEM =
  'You transcribe the readable text/content of the provided file for search indexing. ' +
  'Output plain text only. Include visible headings, dates, times, names, and body text. ' +
  'Do NOT summarize, do NOT invent anything, and do NOT add commentary. If nothing is readable, output an empty response.';

/**
 * Turn a buffer of a given mime into indexable text.
 *   - images -> Gemini vision transcription (needs a key)
 *   - application/pdf -> pdf-parse text; if empty (scanned) -> Gemini vision
 *   - docx/txt -> embeddingService.extractText
 * Returns { text, method } or { text:'', reason } on failure/unsupported.
 */
async function bufferToText(buffer, mimeType) {
  const mime = String(mimeType || '').toLowerCase();

  if (IMAGE_MIME.has(mime)) {
    if (!geminiService.isEnabled()) return { text: '', reason: 'Image understanding needs the AI service (not configured).' };
    const contents = [{
      role: 'user',
      parts: [
        { text: 'Transcribe this image for search indexing.' },
        { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
      ],
    }];
    const res = await geminiService.generate({ system: VISION_SYSTEM, contents });
    return { text: String(res.text || '').trim(), method: 'vision' };
  }

  if (mime === 'application/pdf') {
    let text = '';
    try { text = await embeddingService.extractText(buffer, 'application/pdf'); } catch { text = ''; }
    if (String(text || '').trim().length >= 40) return { text: text.trim(), method: 'pdf-text' };
    // Scanned PDF -> vision fallback.
    if (!geminiService.isEnabled()) return { text: '', reason: 'Scanned PDF needs the AI service (not configured).' };
    const contents = [{
      role: 'user',
      parts: [
        { text: 'Transcribe this scanned PDF for search indexing.' },
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
      ],
    }];
    const res = await geminiService.generate({ system: VISION_SYSTEM, contents });
    return { text: String(res.text || '').trim(), method: 'pdf-vision' };
  }

  if (embeddingService.isExtractable(mime)) {
    try {
      const text = await embeddingService.extractText(buffer, mime);
      return { text: String(text || '').trim(), method: 'text-extract' };
    } catch (err) {
      return { text: '', reason: `Extraction failed: ${err.message}` };
    }
  }

  return { text: '', reason: `Unsupported content type for understanding: ${mime || 'unknown'}.` };
}

/**
 * Fetch a URL (SSRF-safe) and turn its content into text. Throws ApiError on an
 * unsafe/blocked URL (the caller surfaces a clean message).
 */
async function urlToText(url) {
  const fetched = await urlFetchService.fetchSafely(url);
  if (fetched.mimeType === 'text/html') {
    const raw = fetched.buffer.toString('utf8').replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return { text: embeddingService.normalizeText(raw), method: 'url-html', finalUrl: fetched.finalUrl };
  }
  const out = await bufferToText(fetched.buffer, fetched.mimeType);
  return { ...out, finalUrl: fetched.finalUrl };
}

/**
 * Index arbitrary text as a source in the RAG index. Chunks, embeds, and
 * upserts with the given scope + source metadata. Idempotent per
 * (source_type, source_id, chunk_index). Returns { status, chunks?, reason? }.
 *
 * @param {object} p
 * @param {string} p.sourceType   ai_document_chunks.source_type (allow-listed)
 * @param {number} p.sourceId
 * @param {string} p.text
 * @param {object} p.scope        { accessScope, classId?, program?, branch?, semester? }
 * @param {string} [p.title]
 * @param {number} [p.fileId]
 * @param {number} [p.uploadedBy]
 */
async function ingestText({ sourceType, sourceId, text, scope = {}, title = null, fileId = null, uploadedBy = null }) {
  if (!geminiService.isEnabled()) return { status: 'skipped', reason: 'AI embeddings are not configured.' };
  const clean = String(text || '').trim();
  if (!clean) return { status: 'skipped', reason: 'No indexable text.' };

  const chunks = embeddingService.chunkText(clean);
  if (!chunks.length) return { status: 'skipped', reason: 'No chunks produced.' };

  let vectors;
  try {
    vectors = await embeddingService.embedChunks(chunks);
  } catch (err) {
    return { status: 'failed', reason: `Embedding failed: ${err.message}` };
  }
  if (vectors.length !== chunks.length) return { status: 'failed', reason: 'Embedding count mismatch.' };

  try {
    await aiRepository.deleteChunksForSource(sourceType, Number(sourceId));
    for (let i = 0; i < chunks.length; i += 1) {
      const contentHash = embeddingService.hashChunk({ sourceType, sourceId: Number(sourceId), chunkIndex: i, text: chunks[i] });
      // eslint-disable-next-line no-await-in-loop
      await aiRepository.upsertChunk({
        sourceType,
        sourceId: Number(sourceId),
        fileId: fileId || null,
        classId: scope.classId || null,
        program: scope.program || null,
        branch: scope.branch || null,
        semester: scope.semester != null ? scope.semester : null,
        accessScope: scope.accessScope || 'class',
        uploadedBy: uploadedBy || null,
        title: title || null,
        chunkIndex: i,
        chunkText: chunks[i],
        contentHash,
        embedding: vectors[i],
      });
    }
  } catch (err) {
    return { status: 'failed', reason: `Index write failed: ${err.message}` };
  }
  return { status: 'indexed', chunks: chunks.length };
}

/**
 * Index a stored file (image/PDF/docx/txt) as a source. Downloads bytes via the
 * existing storageService, understands them (vision/extract), then ingests the
 * resulting text. Reuses the same scope metadata as class content.
 */
async function ingestFileSource({ sourceType, sourceId, storagePath, mimeType, scope, title, fileId, uploadedBy }) {
  const storageService = require('./storageService');
  if (!storageService.isEnabled()) return { status: 'failed', reason: 'File storage is not enabled.' };
  let buffer;
  try {
    buffer = await storageService.downloadBuffer(storagePath);
  } catch (err) {
    return { status: 'failed', reason: `Download failed: ${err.message}` };
  }
  const understood = await bufferToText(buffer, mimeType);
  if (!understood.text) return { status: 'skipped', reason: understood.reason || 'No readable content.' };
  return ingestText({ sourceType, sourceId, text: understood.text, scope, title, fileId, uploadedBy });
}

/**
 * Index a saved TIMETABLE for a group as searchable public-ish class content.
 * Renders the entries to a compact text block and indexes it under
 * source_type='timetable'. Scope = the timetable's academic group.
 *
 * @param {object} p { timetableId, group:{program,branch,semester}, entries:[toEntryView], title? }
 */
async function ingestTimetable({ timetableId, group, entries = [], title = null }) {
  const lines = entries.map((e) =>
    `${e.day} ${e.startTime}-${e.endTime}: ${e.subject}${e.subjectCode ? ` (${e.subjectCode})` : ''}` +
    `${e.faculty ? ` — ${e.faculty}` : ''}${e.room ? ` @ ${e.room}` : ''}`);
  const text = `Weekly timetable for ${group.program} ${group.branch} Semester ${group.semester}.\n${lines.join('\n')}`;
  return ingestText({
    sourceType: 'timetable',
    sourceId: Number(timetableId),
    text,
    scope: { accessScope: 'class', program: group.program, branch: group.branch, semester: group.semester },
    title: title || `Timetable — ${group.program} ${group.branch} Sem ${group.semester}`,
  });
}

module.exports = {
  bufferToText,
  urlToText,
  ingestText,
  ingestFileSource,
  ingestTimetable,
  VISION_SYSTEM,
};
