/**
 * eventService.js — Institute events (mock).
 * -----------------------------------------------------------------------------
 * Faculty create/manage events; students browse them. Banner/brochure are
 * filenames only in this phase — real files go to Firebase Cloud Storage later,
 * and the record would then carry storage download URLs instead.
 * -----------------------------------------------------------------------------
 */
import { STORAGE_KEYS } from '../config.js';
import { get, set } from './store.js';
import { latency } from './apiClient.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.EVENTS;

/** All events, soonest-first by event datetime. */
export async function getEvents({ createdBy, status } = {}) {
  await latency();
  let list = get(KEY);
  if (createdBy) list = list.filter((e) => e.createdBy === createdBy);
  if (status) list = list.filter((e) => (e.status || 'active') === status);
  return list.slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

export async function getEvent(id) {
  await latency(150);
  return get(KEY).find((e) => e.id === id) || null;
}

/**
 * @param {object} p { title, type, datetime, venue, description, banner, brochure, createdBy, createdByName }
 */
export async function createEvent({ title, type, datetime, venue = '', description = '', banner = null, brochure = null, createdBy, createdByName }) {
  await latency(500);
  const all = get(KEY);
  const record = {
    id: uid('EVT'),
    title: (title || '').trim(),
    type: type || 'Seminar',
    datetime, // ISO local datetime string
    venue: (venue || '').trim(),
    description: (description || '').trim(),
    banner: banner || null,
    brochure: brochure || null,
    createdBy,
    createdByName: createdByName || 'Faculty',
    status: 'active',
    created: new Date().toISOString().slice(0, 10),
  };
  all.unshift(record);
  set(KEY, all);
  return { ok: true, data: record };
}

/** Archive (soft) or restore an event. */
export async function setEventStatus(id, status) {
  await latency();
  const all = get(KEY);
  const e = all.find((x) => x.id === id);
  if (!e) return { ok: false, error: 'Event not found.' };
  e.status = status;
  set(KEY, all);
  return { ok: true, data: e };
}

export async function deleteEvent(id) {
  await latency();
  set(KEY, get(KEY).filter((e) => e.id !== id));
  return { ok: true };
}
