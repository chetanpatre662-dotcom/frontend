/**
 * classService.js — Class/course CRUD (mock).
 * Reads/writes the CLASSES collection via the store. Returns Promises so the
 * UI is already async-ready for real REST calls in Phase 2.
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.CLASSES;

export async function getClasses({ facultyId } = {}) {
  await latency();
  const all = get(KEY);
  return facultyId ? all.filter((c) => c.facultyId === facultyId) : all;
}

export async function getClass(id) {
  await latency(150);
  return get(KEY).find((c) => c.id === id) || null;
}

/**
 * Create a class. Captures the structured academic target (program/branch/
 * semester) that drives automatic student membership, plus a subject name and
 * description. `course` is kept equal to `program` for backward compatibility
 * with announcement/question-paper filters that read `.course`.
 *
 * @param {object} p
 * @param {string} p.facultyId owner (Firebase UID or demo faculty id)
 * @param {string} p.facultyName display name of the owner
 * @param {string} p.courseName subject/course name (e.g. "Compiler Design")
 * @param {string} p.program 'B.Tech' | 'Polytechnic'
 * @param {string} p.branch one of BRANCHES
 * @param {number} p.semester 1..8
 * @param {string} [p.description]
 */
export async function createClass({ facultyId, facultyName, courseName, program, branch, semester, description = '' }) {
  await latency();
  const all = get(KEY);
  const sem = Number(semester);
  // A faculty cannot create two classes with the same subject for the same
  // program/branch/semester.
  const dupe = all.find(
    (c) =>
      c.facultyId === facultyId &&
      (c.program || c.course) === program &&
      c.branch === branch &&
      c.semester === sem &&
      (c.courseName || '').toLowerCase() === (courseName || '').toLowerCase()
  );
  if (dupe) return { ok: false, error: 'You already have this class for that program, branch and semester.' };

  const cls = {
    id: uid('CLS'),
    facultyId,
    facultyName: facultyName || 'Faculty',
    courseName: (courseName || '').trim(),
    course: program, // backward-compat alias
    program,
    branch,
    semester: sem,
    description: (description || '').trim(),
    students: 0, // real count is derived from matching students (see studentClassService)
    status: 'active',
    created: new Date().toISOString().slice(0, 10),
  };
  all.unshift(cls);
  set(KEY, all);
  return { ok: true, data: cls };
}

/** Set/replace mutable class fields (e.g. status). */
export async function updateClass(id, patch) {
  await latency();
  const all = get(KEY);
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: 'Class not found.' };
  all[idx] = { ...all[idx], ...patch };
  set(KEY, all);
  return { ok: true, data: all[idx] };
}

export async function deleteClass(id) {
  await latency();
  set(KEY, get(KEY).filter((c) => c.id !== id));
  return { ok: true };
}
