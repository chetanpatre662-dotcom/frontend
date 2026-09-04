/**
 * announcementService.js — Announcement CRUD + audience matching (mock).
 *
 * getForStudent() demonstrates the targeting logic students will experience
 * once the backend + WebSocket push announcements in real time.
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.ANNOUNCEMENTS;

export async function getAnnouncements({ facultyId } = {}) {
  await latency();
  const all = get(KEY);
  const list = facultyId ? all.filter((a) => a.facultyId === facultyId) : all;
  return list.sort((a, b) => new Date(b.created) - new Date(a.created));
}

export async function getAnnouncement(id) {
  await latency(150);
  return get(KEY).find((a) => a.id === id) || null;
}

export async function createAnnouncement(data) {
  await latency();
  const all = get(KEY);
  const record = {
    id: uid('ANN'),
    created: new Date().toISOString(),
    status: data.status || 'published',
    attachment: data.attachment || null,
    ...data,
  };
  all.unshift(record);
  set(KEY, all);
  // Phase 2: backend emits event -> WebSocket -> targeted students update live.
  return { ok: true, data: record };
}

export async function updateAnnouncement(id, data) {
  await latency();
  const all = get(KEY);
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return { ok: false, error: 'Announcement not found.' };
  all[idx] = { ...all[idx], ...data };
  set(KEY, all);
  return { ok: true, data: all[idx] };
}

export async function deleteAnnouncement(id) {
  await latency();
  set(KEY, get(KEY).filter((a) => a.id !== id));
  return { ok: true };
}

/**
 * Return published announcements relevant to a given student profile.
 * Mirrors the targeting rules the backend will enforce later.
 */
export async function getForStudent({ course, branch, semester }) {
  await latency();
  const published = get(KEY).filter((a) => a.status === 'published');
  return published
    .filter((a) => matchesAudience(a, { course, branch, semester }))
    .sort((a, b) => new Date(b.created) - new Date(a.created));
}

export function matchesAudience(a, { course, branch, semester }) {
  switch (a.audience) {
    case 'All Students':
      return true;
    case 'B.Tech':
      return course === 'B.Tech';
    case 'Polytechnic':
      return course === 'Polytechnic';
    case 'Specific Branch':
      return a.course === course && a.branch === branch;
    case 'Specific Semester':
      return a.course === course && a.branch === branch && Number(a.semester) === Number(semester);
    default:
      return false;
  }
}
