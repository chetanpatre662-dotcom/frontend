/**
 * notesService.js — Class notes / study material (mock).
 * -----------------------------------------------------------------------------
 * Faculty upload notes to a class; matching students can view/download.
 * File STORAGE is deferred to Firebase Cloud Storage (Phase 2) — here we only
 * capture metadata + a filename. The DB should store metadata + storagePath,
 * never the file bytes.
 * -----------------------------------------------------------------------------
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.NOTES;

export async function getNotes({ classId } = {}) {
  await latency();
  const all = get(KEY);
  const list = classId ? all.filter((n) => n.classId === classId) : all;
  return list.sort((a, b) => new Date(b.created) - new Date(a.created));
}

/**
 * @param {object} p { classId, title, description, fileName, link, uploadedBy, uploadedByName }
 * `fileName` OR `link` (external resource URL) — at least one should be present.
 */
export async function uploadNote({ classId, title, description = '', fileName = '', link = '', uploadedBy, uploadedByName }) {
  await latency(500); // uploads feel slower — exercise the loading state
  const all = get(KEY);
  const record = {
    id: uid('NOTE'),
    classId,
    title: (title || '').trim(),
    description: (description || '').trim(),
    fileName: fileName || '',
    link: (link || '').trim(),
    kind: fileKind(fileName),
    // Phase 2: real Firebase Storage path/URL returned after upload.
    storagePath: fileName ? `classes/${classId}/notes/${fileName}` : '',
    uploadedBy,
    uploadedByName: uploadedByName || 'Faculty',
    created: new Date().toISOString().slice(0, 10),
  };
  all.unshift(record);
  set(KEY, all);
  return { ok: true, data: record };
}

/** Classify a filename into a coarse media kind for UI thumbnails/icons. */
export function fileKind(fileName = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['ppt', 'pptx'].includes(ext)) return 'slides';
  return 'file';
}

export async function deleteNote(id) {
  await latency();
  set(KEY, get(KEY).filter((n) => n.id !== id));
  return { ok: true };
}
