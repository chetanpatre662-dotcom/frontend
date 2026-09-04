/**
 * studentService.js — Student directory (mock).
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';

const KEY = STORAGE_KEYS.STUDENTS;

export async function getStudents() {
  await latency();
  return get(KEY);
}

export async function getStudent(id) {
  await latency(150);
  return get(KEY).find((s) => s.id === id) || null;
}

export async function setStudentStatus(id, status) {
  await latency();
  const all = get(KEY);
  const s = all.find((x) => x.id === id);
  if (s) { s.status = status; set(KEY, all); }
  return { ok: Boolean(s) };
}

export async function countStudents() {
  return (await getStudents()).length;
}
