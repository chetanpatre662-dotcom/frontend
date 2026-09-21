/**
 * services/documentIngestService.js
 * -----------------------------------------------------------------------------
 * Reusable RAG ingestion pipeline for Askbook documents:
 *
 *   source row (+ stored file) -> download bytes (Firebase, server-side)
 *     -> extract text -> normalize -> chunk -> embed (Gemini) -> upsert chunks
 *        with permission/scope metadata (content_hash dedup).
 *
 * FAIL LOUDLY: any failure (storage disabled, missing file, unextractable type,
 * empty text, embedding error) returns a structured result with status:'failed'
 * (or 'skipped') and a reason. A document is NEVER recorded as "indexed" unless
 * its chunks were actually embedded and written. Nothing is faked.
 *
 * SCOPE: class-scoped content (note/question_paper/assignment/project) is
 * indexed with access_scope='class' + the class's program/branch/semester, so
 * ragService/aiRepository can permission-filter retrieval to the right academic
 * group / owning faculty. (Announcements/events could be indexed as 'public'
 * later; not required for the file-based corpora.)
 *
 * This is an ADMIN-triggered maintenance job (see POST /api/ai/ingest). It does
 * not run automatically on upload in this read-only phase — keeping ingestion
 * explicit and observable.
 * -----------------------------------------------------------------------------
 */
'use strict';

const aiRepository = require('../repositories/aiRepository');
const aiDocumentRepository = require('../repositories/aiDocumentRepository');
const embeddingService = require('./embeddingService');
const storageService = require('./storageService');
const geminiService = require('./geminiService');

const SUPPORTED_SOURCE_TYPES = ['note', 'question_paper', 'assignment', 'project'];

/**
 * Shared low-level step: download a stored file, extract + chunk + embed, then
 * replace the source's chunks with fresh scope-stamped rows. Returns a
 * structured { status, chunks?, reason? } — never throws for expected failures.
 *
 * @param {object} p
 * @param {string} p.sourceType  - ai_document_chunks.source_type
 * @param {number} p.sourceId    - ai_document_chunks.source_id
 * @param {number} p.fileId      - files.id
 * @param {string} p.storagePath - Firebase object path
 * @param {string} p.mimeType
 * @param {object} p.scope       - { accessScope, classId, program, branch, semester }
 * @param {number} [p.uploadedBy]
 * @param {string} [p.title]
 */
async function embedAndStore({ sourceType, sourceId, fileId, storagePath, mimeType, scope, uploadedBy, title }) {
  if (!embeddingService.isExtractable(mimeType)) {
    return { status: 'skipped', reason: `File type not text-extractable: ${mimeType || 'unknown'}.` };
  }

  let buffer;
  try {
    buffer = await storageService.downloadBuffer(storagePath);
  } catch (err) {
    return { status: 'failed', reason: `Download failed: ${err.message}` };
  }

  let chunks;
  try {
    const text = await embeddingService.extractText(buffer, mimeType);
    chunks = embeddingService.chunkText(text);
  } catch (err) {
    return { status: 'failed', reason: `Text extraction failed: ${err.message}` };
  }
  if (!chunks.length) {
    return { status: 'skipped', reason: 'No extractable text (empty or image-only document).' };
  }

  let vectors;
  try {
    vectors = await embeddingService.embedChunks(chunks);
  } catch (err) {
    return { status: 'failed', reason: `Embedding failed: ${err.message}` };
  }
  if (vectors.length !== chunks.length) {
    return { status: 'failed', reason: 'Embedding count mismatch.' };
  }

  try {
    await aiRepository.deleteChunksForSource(sourceType, Number(sourceId));
    for (let i = 0; i < chunks.length; i += 1) {
      const contentHash = embeddingService.hashChunk({
        sourceType, sourceId: Number(sourceId), chunkIndex: i, text: chunks[i],
      });
      // eslint-disable-next-line no-await-in-loop
      await aiRepository.upsertChunk({
        sourceType,
        sourceId: Number(sourceId),
        fileId: fileId || null,
        classId: (scope && scope.classId) || null,
        program: (scope && scope.program) || null,
        branch: (scope && scope.branch) || null,
        semester: (scope && scope.semester) != null ? scope.semester : null,
        accessScope: (scope && scope.accessScope) || 'class',
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
 * Ingest a single content source (by type + id). Idempotent: re-ingesting the
 * same document deletes its old chunks and re-writes fresh ones (upsert by
 * (source_type, source_id, chunk_index)).
 *
 * @returns {Promise<object>} { sourceType, sourceId, status, chunks?, reason? }
 *   status: 'indexed' | 'skipped' | 'failed'
 */
async function ingestSource(sourceType, sourceId) {
  const base = { sourceType, sourceId: Number(sourceId) };

  if (!SUPPORTED_SOURCE_TYPES.includes(sourceType)) {
    return { ...base, status: 'failed', reason: `Unsupported source type: ${sourceType}.` };
  }
  if (!geminiService.isEnabled()) {
    return { ...base, status: 'failed', reason: 'AI embeddings are not configured (GEMINI_API_KEY).' };
  }
  if (!storageService.isEnabled()) {
    return { ...base, status: 'failed', reason: 'File storage is not enabled (FIREBASE_STORAGE_BUCKET).' };
  }

  let src;
  try {
    src = await aiRepository.findIngestSource(sourceType, sourceId);
  } catch (err) {
    return { ...base, status: 'failed', reason: `Lookup failed: ${err.message}` };
  }
  if (!src) return { ...base, status: 'failed', reason: 'Source not found.' };
  if (!src.file_id || !src.storage_path) {
    return { ...base, status: 'skipped', reason: 'No stored file attached (nothing to extract).' };
  }

  const result = await embedAndStore({
    sourceType,
    sourceId: Number(sourceId),
    fileId: src.file_id,
    storagePath: src.storage_path,
    mimeType: src.mime_type,
    scope: {
      accessScope: 'class',
      classId: src.class_id,
      program: src.program,
      branch: src.branch,
      semester: src.semester,
    },
    uploadedBy: src.uploaded_by || null,
    title: src.title || null,
  });
  return { ...base, ...result, title: src.title || null };
}

/**
 * Bulk-ingest all stored files of one (or all) supported source type(s),
 * optionally restricted to a class. Returns a per-source summary — never
 * throws; each source's outcome is reported individually.
 *
 * @param {object} [opts] { sourceType?, classId?, limit? }
 */
async function ingestAll({ sourceType = null, classId = null, limit = 500 } = {}) {
  const types = sourceType ? [sourceType] : SUPPORTED_SOURCE_TYPES;
  const results = [];
  const summary = { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  for (const type of types) {
    if (!SUPPORTED_SOURCE_TYPES.includes(type)) {
      results.push({ sourceType: type, status: 'failed', reason: 'Unsupported source type.' });
      summary.failed += 1;
      continue;
    }
    let sources = [];
    try {
      sources = await aiRepository.listIngestSources(type, { classId, limit });
    } catch (err) {
      results.push({ sourceType: type, status: 'failed', reason: `List failed: ${err.message}` });
      summary.failed += 1;
      continue;
    }
    for (const s of sources) {
      // eslint-disable-next-line no-await-in-loop
      const r = await ingestSource(type, s.id);
      results.push(r);
      summary[r.status] = (summary[r.status] || 0) + 1;
      if (r.status === 'indexed') summary.chunks += r.chunks || 0;
    }
  }
  return { summary, results };
}

/**
 * Ingest a STANDALONE admin document (ai_documents row). Uses the document's
 * own access scope (public or a class group). Updates the ai_documents row's
 * status/index_error/chunks_count so the admin UI reflects reality — never
 * marks a failed/empty document as indexed.
 *
 * @param {number} docId - ai_documents.id
 * @returns {Promise<object>} { documentId, status, chunks?, reason? }
 */
async function ingestDocument(docId) {
  const base = { documentId: Number(docId) };

  let doc;
  try {
    doc = await aiDocumentRepository.findById(docId);
  } catch (err) {
    return { ...base, status: 'failed', reason: `Lookup failed: ${err.message}` };
  }
  if (!doc) return { ...base, status: 'failed', reason: 'Document not found.' };

  const fail = async (status, reason) => {
    try { await aiDocumentRepository.setStatus(docId, { status, indexError: reason, chunksCount: 0 }); } catch { /* ignore */ }
    return { ...base, status, reason };
  };

  if (!geminiService.isEnabled()) return fail('failed', 'AI embeddings are not configured (GEMINI_API_KEY).');
  if (!storageService.isEnabled()) return fail('failed', 'File storage is not enabled (FIREBASE_STORAGE_BUCKET).');

  // Resolve the stored file for this document.
  if (!doc.file_id) return fail('skipped', 'No stored file attached.');
  let fileRow;
  try {
    const fileRepository = require('../repositories/fileRepository');
    fileRow = await fileRepository.findById(doc.file_id);
  } catch (err) {
    return fail('failed', `File lookup failed: ${err.message}`);
  }
  if (!fileRow || !fileRow.storage_path || fileRow.status !== 'stored') {
    return fail('skipped', 'Stored file is unavailable.');
  }

  const result = await embedAndStore({
    sourceType: 'document',
    sourceId: doc.id,
    fileId: doc.file_id,
    storagePath: fileRow.storage_path,
    mimeType: doc.mime_type || fileRow.mime_type,
    scope: {
      accessScope: doc.access_scope || 'public',
      classId: doc.class_id,
      program: doc.program,
      branch: doc.branch,
      semester: doc.semester,
    },
    uploadedBy: doc.uploaded_by,
    title: doc.title,
  });

  try {
    await aiDocumentRepository.setStatus(docId, {
      status: result.status,
      indexError: result.reason || null,
      chunksCount: result.chunks || 0,
    });
  } catch { /* status update best-effort */ }

  return { ...base, ...result };
}

/**
 * Ingest a content source, falling back to multimodal (Gemini Vision) ONLY when
 * the normal text pipeline reports the file has no extractable text (i.e. a
 * scanned / image-only PDF). This is the single entry point callers should use
 * so both new uploads and existing-document backfills behave identically.
 *
 * Flow:
 *   1. ingestSource(sourceType, sourceId)  (existing text pipeline, unchanged)
 *   2. if status==='indexed'        -> return it as-is.
 *   3. if status==='skipped' AND the reason is the "No extractable text"
 *      (image-only) case            -> ONE multimodal fallback attempt via
 *      multimodalIngestService.ingestFileSource(...) using the SAME source
 *      metadata (reused from aiRepository.findIngestSource — no duplicate SQL).
 *   4. any other status/reason      -> return unchanged (no fallback).
 *
 * Never retries and never recurses. Non-throwing for expected failures — returns
 * a structured result. Only entity types the text pipeline supports are handled.
 *
 * @param {string} sourceType  note | question_paper | assignment | project
 * @param {number} sourceId
 * @returns {Promise<object>} { sourceType, sourceId, status, chunks?, reason?, via? }
 */
async function ingestSourceWithFallback(sourceType, sourceId) {
  // Call through the module export so the primary text pipeline is a single,
  // interceptable seam (keeps the helper a thin composition over ingestSource).
  const primary = await module.exports.ingestSource(sourceType, sourceId);

  // Success or any non-"no-text" outcome: return the text-pipeline result as-is.
  if (!primary || primary.status !== 'skipped') return primary;
  const reason = String(primary.reason || '');
  const isNoText = /no extractable text|image-only/i.test(reason);
  if (!isNoText) return primary;

  // Scanned/image-only PDF: attempt the multimodal (vision) path exactly once.
  // Reuse the SAME lookup the text pipeline used (no duplicated SQL here).
  let src;
  try {
    src = await aiRepository.findIngestSource(sourceType, Number(sourceId));
  } catch (err) {
    return { ...primary, via: 'text', fallback: { status: 'failed', reason: `Fallback lookup failed: ${err.message}` } };
  }
  if (!src || !src.file_id || !src.storage_path) {
    // Nothing to read via vision either — keep the honest text-path result.
    return primary;
  }

  const multimodalIngestService = require('./multimodalIngestService');
  const fb = await multimodalIngestService.ingestFileSource({
    sourceType,
    sourceId: Number(sourceId),
    storagePath: src.storage_path,
    mimeType: src.mime_type,
    scope: {
      accessScope: 'class',
      classId: src.class_id,
      program: src.program,
      branch: src.branch,
      semester: src.semester,
    },
    title: src.title || null,
    fileId: src.file_id,
    uploadedBy: src.uploaded_by || null,
  });

  // Surface the fallback outcome as the effective result, tagged so callers/logs
  // can see it came from vision. On fallback failure/skip, the reason is honest.
  return { sourceType, sourceId: Number(sourceId), ...fb, via: 'multimodal', title: src.title || null };
}

module.exports = { ingestSource, ingestSourceWithFallback, ingestAll, ingestDocument, embedAndStore, SUPPORTED_SOURCE_TYPES };
