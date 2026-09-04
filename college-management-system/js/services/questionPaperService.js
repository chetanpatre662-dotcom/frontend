/**
 * questionPaperService.js — Previous question papers (mock).
 *
 * File upload/storage is out of scope for Phase 1. We only capture metadata +
 * a filename. Phase 2 wires the file to Firebase Cloud Storage and stores the
 * returned download URL on the record.
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.QUESTION_PAPERS;

export async function getPapers({ facultyId, classId } = {}) {
  await latency();
  let list = get(KEY);
  if (facultyId) list = list.filter((p) => p.facultyId === facultyId);
  if (classId) list = list.filter((p) => p.classId === classId);
  return list.slice().sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
}

export async function uploadPaper(data) {
  await latency(500); // uploads feel slower — exercise the loading state
  const all = get(KEY);
  const record = {
    id: uid('QP'),
    uploaded: new Date().toISOString().slice(0, 10),
    // Phase 2: `file` becomes a Firebase Storage download URL.
    file: data.fileName || 'uploaded_paper.pdf',
    ...data,
  };
  delete record.fileName;
  all.unshift(record);
  set(KEY, all);
  return { ok: true, data: record };
}

export async function deletePaper(id) {
  await latency();
  set(KEY, get(KEY).filter((p) => p.id !== id));
  return { ok: true };
}
