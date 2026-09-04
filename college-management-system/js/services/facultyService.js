/**
 * facultyService.js — Faculty directory + admin management (mock).
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.FACULTY;

export async function getFaculty() {
  await latency();
  return get(KEY);
}

export async function addFaculty(data) {
  await latency();
  const all = get(KEY);
  const record = {
    id: uid('FAC'),
    status: 'active',
    joined: new Date().toISOString().slice(0, 10),
    ...data,
  };
  all.unshift(record);
  set(KEY, all);
  return { ok: true, data: record };
}

export async function updateFaculty(id, data) {
  await latency();
  const all = get(KEY);
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) return { ok: false, error: 'Faculty not found.' };
  all[idx] = { ...all[idx], ...data };
  set(KEY, all);
  return { ok: true, data: all[idx] };
}

export async function toggleFacultyStatus(id) {
  await latency();
  const all = get(KEY);
  const f = all.find((x) => x.id === id);
  if (f) { f.status = f.status === 'active' ? 'inactive' : 'active'; set(KEY, all); }
  return { ok: Boolean(f), data: f };
}

export async function countFaculty() {
  return (await getFaculty()).length;
}
