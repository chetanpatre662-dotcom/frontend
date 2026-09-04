/**
 * messageService.js — Class messages / faculty announcements to a class (mock).
 * -----------------------------------------------------------------------------
 * Faculty post messages to a class; matching students read them.
 *
 * REAL-TIME (Phase 2): when a faculty member posts, the backend persists it and
 * emits an event over WebSocket to the class members so their class page updates
 * without a refresh. The frontend seam for this already exists in
 * services/websocketService.js (subscribe/emit). This service stays the same;
 * only its internals switch from the local store to the API + socket events.
 * -----------------------------------------------------------------------------
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';
import { emit } from './websocketService.js';

const KEY = STORAGE_KEYS.MESSAGES;

export async function getMessages({ classId } = {}) {
  await latency();
  const all = get(KEY);
  const list = classId ? all.filter((m) => m.classId === classId) : all;
  // Oldest first for a chat-like transcript; callers can reverse if needed.
  return list.sort((a, b) => new Date(a.created) - new Date(b.created));
}

/**
 * Post a message to a class.
 * @param {object} p { classId, facultyId, facultyName, body, attachment }
 */
export async function sendMessage({ classId, facultyId, facultyName, body, attachment = null }) {
  await latency();
  const all = get(KEY);
  const record = {
    id: uid('MSG'),
    classId,
    facultyId,
    facultyName: facultyName || 'Faculty',
    body: (body || '').trim(),
    attachment,
    created: new Date().toISOString(),
    unread: true,
  };
  all.push(record);
  set(KEY, all);
  // Phase 2: backend emits this over WebSocket to class members. The local
  // emit() is a no-op bus today but documents the integration point.
  emit('class:message', { classId, message: record });
  return { ok: true, data: record };
}

/** Count unread messages for a class (used for nav badges / cards). */
export async function countUnread({ classId } = {}) {
  const all = get(KEY);
  const list = classId ? all.filter((m) => m.classId === classId) : all;
  return list.filter((m) => m.unread).length;
}
