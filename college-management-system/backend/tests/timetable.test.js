/**
 * tests/timetable.test.js — timetable + multimodal + SSRF unit tests.
 * -----------------------------------------------------------------------------
 * PURE-LOGIC + STUBBED tests (no live Gemini, no network, no DB). We stub the
 * database module before requiring anything that transitively loads it, then
 * test the deterministic pieces: day/time parsing, entry validation, subject
 * matching, conflict detection, the deterministic text-timetable parser, model
 * JSON parsing, and the SSRF URL guard (IP-range classification only — no real
 * network calls are made).
 *
 * Run: node --test   (from backend/)
 * -----------------------------------------------------------------------------
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/* Stub the DB so requiring services doesn't open a pool. */
const dbPath = require.resolve('../src/config/database');
require.cache[dbPath] = new Module(dbPath, module);
require.cache[dbPath].exports = {
  pool: {}, query: async () => ({ rows: [], rowCount: 0 }),
  verifyConnection: async () => ({ ok: true }), closePool: async () => {},
};
require.cache[dbPath].loaded = true;

const timetableService = require('../src/services/timetableService');
const urlFetchService = require('../src/services/urlFetchService');
const ttExtract = require('../src/services/timetableExtractionService');

/* ============================= day / time parsing ======================== */

test('parseDay understands names, short forms, indexes and Hindi variants', () => {
  assert.equal(timetableService.parseDay('Monday'), 0);
  assert.equal(timetableService.parseDay('mon'), 0);
  assert.equal(timetableService.parseDay('TUE'), 1);
  assert.equal(timetableService.parseDay(3), 3);
  assert.equal(timetableService.parseDay('6'), 6);
  assert.equal(timetableService.parseDay('somvar'), 0);
  assert.equal(timetableService.parseDay('notaday'), null);
});

test('parseTime normalizes 12h/24h/dotted forms to HH:MM', () => {
  assert.equal(timetableService.parseTime('9:30'), '09:30');
  assert.equal(timetableService.parseTime('09:30'), '09:30');
  assert.equal(timetableService.parseTime('9.30'), '09:30');
  assert.equal(timetableService.parseTime('2 PM'), '14:00');
  assert.equal(timetableService.parseTime('12 AM'), '00:00');
  assert.equal(timetableService.parseTime('14:00'), '14:00');
  assert.equal(timetableService.parseTime('nope'), null);
  assert.equal(timetableService.parseTime('25:00'), null);
});

/* ============================ entry validation =========================== */

test('normalizeEntry accepts a valid row and rejects bad ones', () => {
  const ok = timetableService.normalizeEntry({ day: 'Monday', start: '9:30', end: '10:30', subject: 'DSA' });
  assert.equal(ok.ok, true);
  assert.equal(ok.entry.dayOfWeek, 0);
  assert.equal(ok.entry.startTime, '09:30');
  assert.equal(ok.entry.endTime, '10:30');
  assert.equal(ok.entry.subjectName, 'DSA');

  const noSubject = timetableService.normalizeEntry({ day: 'Monday', start: '9:30', end: '10:30' });
  assert.equal(noSubject.ok, false);
  assert.ok(noSubject.errors.some((e) => /subject/i.test(e)));

  const badTime = timetableService.normalizeEntry({ day: 'Monday', start: '10:30', end: '9:30', subject: 'X' });
  assert.equal(badTime.ok, false);
  assert.ok(badTime.errors.some((e) => /before/i.test(e)));

  const badDay = timetableService.normalizeEntry({ day: 'Funday', start: '9:30', end: '10:30', subject: 'X' });
  assert.equal(badDay.ok, false);
});

/* ============================= subject matching ========================== */

const SUBJECTS = [
  { id: 1, name: 'Data Structures', code: 'CS201' },
  { id: 2, name: 'Mathematics', code: 'MA101' },
  { id: 3, name: 'Database Management Systems', code: 'CS202' },
];

test('matchSubject: exact code + exact name are HIGH confidence', () => {
  const byCode = timetableService.matchSubject('whatever', 'CS201', SUBJECTS);
  assert.equal(byCode.courseId, 1);
  assert.equal(byCode.confidence, 'high');

  const byName = timetableService.matchSubject('Mathematics', '', SUBJECTS);
  assert.equal(byName.courseId, 2);
  assert.equal(byName.confidence, 'high');
});

test('matchSubject: abbreviation "DSA" maps to Data Structures (MEDIUM)', () => {
  const m = timetableService.matchSubject('DSA', '', SUBJECTS);
  assert.equal(m.courseId, 1);
  assert.equal(m.confidence, 'medium');
});

test('matchSubject: unknown subject stays LOW with no courseId (needs review)', () => {
  const m = timetableService.matchSubject('Underwater Basket Weaving', '', SUBJECTS);
  assert.equal(m.courseId, null);
  assert.equal(m.confidence, 'low');
});

/* ============================ conflict detection ========================= */

test('detectConflicts flags overlapping same-day slots, ignores different days', () => {
  const entries = [
    { dayOfWeek: 0, startTime: '09:30', endTime: '10:30' },
    { dayOfWeek: 0, startTime: '10:00', endTime: '11:00' }, // overlaps #0
    { dayOfWeek: 1, startTime: '09:30', endTime: '10:30' }, // different day
  ];
  const conflicts = timetableService.detectConflicts(entries);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].day, 'Monday');
});

test('detectConflicts: back-to-back slots do NOT conflict', () => {
  const entries = [
    { dayOfWeek: 0, startTime: '09:30', endTime: '10:30' },
    { dayOfWeek: 0, startTime: '10:30', endTime: '11:30' },
  ];
  assert.equal(timetableService.detectConflicts(entries).length, 0);
});

/* ===================== deterministic text-timetable parse ================ */

test('parseTextTimetable reads a day-block text timetable without AI', () => {
  const text = [
    'Monday',
    '9:30-10:30 Data Structures',
    '10:30-11:30 Mathematics',
    'Tuesday',
    '9:30-10:30 DBMS',
  ].join('\n');
  const rows = ttExtract.parseTextTimetable(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].day, 0);
  assert.equal(rows[0].start, '09:30');
  assert.equal(rows[0].subject, 'Data Structures');
  assert.equal(rows[2].day, 1);
  assert.equal(rows[2].subject, 'DBMS');
});

test('parseModelJson extracts a JSON array from fenced/model output', () => {
  const reply = '```json\n[{"day":"Monday","start":"09:30","end":"10:30","subject":"DSA"}]\n```';
  const rows = ttExtract.parseModelJson(reply);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, 'DSA');
  assert.deepEqual(ttExtract.parseModelJson('no json here'), []);
});

/* ============================== SSRF guard =============================== */

test('SSRF guard blocks loopback / private / link-local / CGNAT IPv4', () => {
  const { isBlockedIPv4 } = urlFetchService;
  assert.equal(isBlockedIPv4('127.0.0.1'), true);
  assert.equal(isBlockedIPv4('10.0.0.5'), true);
  assert.equal(isBlockedIPv4('172.16.0.1'), true);
  assert.equal(isBlockedIPv4('192.168.1.1'), true);
  assert.equal(isBlockedIPv4('169.254.169.254'), true); // cloud metadata
  assert.equal(isBlockedIPv4('100.64.0.1'), true);      // CGNAT
  assert.equal(isBlockedIPv4('0.0.0.0'), true);
  // A public address is allowed.
  assert.equal(isBlockedIPv4('93.184.216.34'), false);  // example.com
  assert.equal(isBlockedIPv4('8.8.8.8'), false);
});

test('SSRF guard blocks loopback / link-local / ULA / mapped IPv6', () => {
  const { isBlockedIPv6 } = urlFetchService;
  assert.equal(isBlockedIPv6('::1'), true);
  assert.equal(isBlockedIPv6('fe80::1'), true);
  assert.equal(isBlockedIPv6('fd00::1'), true);
  assert.equal(isBlockedIPv6('::ffff:127.0.0.1'), true); // mapped loopback
  assert.equal(isBlockedIPv6('2606:2800:220:1:248:1893:25c8:1946'), false); // public
});

test('assertSafeUrl refuses http:// and localhost hostnames', async () => {
  await assert.rejects(() => urlFetchService.assertSafeUrl('http://example.com/x'), /https/i);
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://localhost/x'), /local/i);
  await assert.rejects(() => urlFetchService.assertSafeUrl('not a url'), /valid/i);
});

test('assertSafeUrl refuses a URL whose host is a private IP literal', async () => {
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://127.0.0.1/secret'), /private/i);
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://169.254.169.254/latest/meta-data'), /private/i);
});

test('assertSafeUrl refuses embedded credentials and non-443 ports', async () => {
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://user:pass@example.com/x'), /credential/i);
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://public.example.com:22/x'), /port/i);
  // The classic "userinfo confusion" trick: host is actually 127.0.0.1.
  await assert.rejects(() => urlFetchService.assertSafeUrl('https://example.com@127.0.0.1/x'), /credential|private/i);
});
