/**
 * store.js — Tiny localStorage-backed persistence used by mock services.
 *
 * This is the ONLY place mock persistence lives. Services call get()/set().
 * When the real backend is wired up, services stop calling this and call
 * apiClient instead — no UI change required.
 */
import { STORAGE_KEYS } from '../config.js';
import {
  mockFaculty,
  mockStudents,
  mockClasses,
  mockAnnouncements,
  mockQuestionPapers,
  mockNotes,
  mockMessages,
  mockEvents,
} from '../data/mockData.js';

const SEEDS = {
  [STORAGE_KEYS.FACULTY]: mockFaculty,
  [STORAGE_KEYS.STUDENTS]: mockStudents,
  [STORAGE_KEYS.CLASSES]: mockClasses,
  [STORAGE_KEYS.ANNOUNCEMENTS]: mockAnnouncements,
  [STORAGE_KEYS.QUESTION_PAPERS]: mockQuestionPapers,
  [STORAGE_KEYS.NOTES]: mockNotes,
  [STORAGE_KEYS.MESSAGES]: mockMessages,
  [STORAGE_KEYS.EVENTS]: mockEvents,
};

/** Read a collection, seeding it on first access. */
export function get(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    const seed = SEEDS[key] ? structuredClone(SEEDS[key]) : [];
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return SEEDS[key] ? structuredClone(SEEDS[key]) : [];
  }
}

export function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

/** Reset all mock data back to seeds (used by admin settings "reset demo"). */
export function resetAll() {
  Object.keys(SEEDS).forEach((k) => localStorage.removeItem(k));
  // Also clear seedless collections (e.g. AI chat history) so a reset is total.
  localStorage.removeItem(STORAGE_KEYS.AI_CHATS);
}
