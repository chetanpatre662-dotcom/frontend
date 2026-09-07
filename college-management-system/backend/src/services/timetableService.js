/**
 * services/timetableService.js
 * -----------------------------------------------------------------------------
 * Business logic for admin-managed TIMETABLES within a Course + Branch +
 * Semester. Reuses subjectService.validateGroup (catalog-backed) for the group
 * key and the existing `courses` table for subject matching. No new access path.
 *
 * Responsibilities:
 *   - normalize + validate individual timetable entries (day/time/subject)
 *   - detect time conflicts (two classes overlapping on the same day)
 *   - safely MATCH an extracted subject label to a real subject (courses row)
 *     for the group, WITHOUT ever auto-creating subjects
 *   - persist a reviewed timetable (replaceForGroup, atomic)
 *   - read a group's / faculty's timetable for the AI tool + read routes
 *
 * The pure helpers (parse/validate/match/conflicts) are exported for unit tests
 * so the logic is verifiable without a database or a live Gemini key.
 * -----------------------------------------------------------------------------
 */
'use strict';

const timetableRepository = require('../repositories/timetableRepository');
const subjectRepository = require('../repositories/subjectRepository');
const subjectService = require('./subjectService');
const ApiError = require('../utils/ApiError');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LOOKUP = (() => {
  const m = new Map();
  DAY_NAMES.forEach((full, i) => {
    m.set(full.toLowerCase(), i);
    m.set(full.slice(0, 3).toLowerCase(), i); // mon, tue, ...
  });
  // Common Hindi/roman variants seen on Indian timetables.
  [['somvar', 0], ['mangalvar', 1], ['budhvar', 2], ['guruvar', 3], ['shukravar', 4], ['shanivar', 5], ['ravivar', 6]]
    .forEach(([k, v]) => m.set(k, v));
  return m;
})();

/** Parse a day label ("Monday", "mon", 0..6) into 0..6 or null. */
function parseDay(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  const key = String(value).trim().toLowerCase();
  if (/^[0-6]$/.test(key)) return Number(key);
  return DAY_LOOKUP.has(key) ? DAY_LOOKUP.get(key) : null;
}

/** Human day name from 0..6 (or null). */
function dayName(dow) {
  return dow != null && dow >= 0 && dow <= 6 ? DAY_NAMES[dow] : null;
}

/**
 * Normalize a time string to 24h "HH:MM". Accepts "9:30", "09:30", "9.30",
 * "9:30 AM", "2 PM", "14:00". Returns null when it cannot be parsed.
 */
function parseTime(value) {
  if (value == null) return null;
  let s = String(value).trim().toLowerCase().replace(/\./g, ':');
  const ampm = /(am|pm)\s*$/.exec(s);
  const mer = ampm ? ampm[1] : null;
  s = s.replace(/\s*(am|pm)\s*$/, '').trim();
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "HH:MM" -> minutes since midnight (for ordering/overlap math). */
function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Normalize a raw extracted/edited entry into a strict shape, WITHOUT touching
 * the database. Returns { ok, entry?, errors? }. subjectName is required; day
 * and both times must parse; start < end.
 */
function normalizeEntry(raw = {}) {
  const errors = [];
  const dow = parseDay(raw.dayOfWeek != null ? raw.dayOfWeek : raw.day);
  if (dow == null) errors.push('invalid or missing day');

  const start = parseTime(raw.startTime || raw.start);
  const end = parseTime(raw.endTime || raw.end);
  if (!start) errors.push('invalid or missing start time');
  if (!end) errors.push('invalid or missing end time');
  if (start && end && toMinutes(start) >= toMinutes(end)) errors.push('start time must be before end time');

  const subjectName = String(raw.subjectName || raw.subject || '').trim();
  if (!subjectName) errors.push('missing subject');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    entry: {
      dayOfWeek: dow,
      startTime: start,
      endTime: end,
      subjectName: subjectName.slice(0, 200),
      subjectCode: raw.subjectCode ? String(raw.subjectCode).trim().slice(0, 40) : null,
      courseId: raw.courseId != null && raw.courseId !== '' ? Number(raw.courseId) : null,
      facultyId: raw.facultyId != null && raw.facultyId !== '' ? Number(raw.facultyId) : null,
      facultyName: raw.facultyName ? String(raw.facultyName).trim().slice(0, 200) : null,
      room: raw.room ? String(raw.room).trim().slice(0, 60) : null,
    },
  };
}

/** Simple normalized token form for fuzzy subject matching. */
function normLabel(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Known abbreviation seeds → help match "DSA"→"Data Structures" etc. */
const ABBREV = {
  dsa: 'data structures', ds: 'data structures', dbms: 'database management',
  oops: 'object oriented programming', oop: 'object oriented programming',
  os: 'operating systems', cn: 'computer networks', maths: 'mathematics', math: 'mathematics',
};

/**
 * Match an extracted subject label against the REAL subjects (courses rows) for
 * a group. Returns { courseId, matchedName, confidence, code } — courseId is
 * null when confidence is low so the admin resolves it. NEVER creates subjects.
 *
 * confidence: 'high' (exact name/code), 'medium' (abbrev/substring), 'low' (none).
 */
function matchSubject(label, code, subjects) {
  const want = normLabel(label);
  const wantCode = normLabel(code);
  if (!subjects || !subjects.length || (!want && !wantCode)) {
    return { courseId: null, matchedName: null, confidence: 'low', code: null };
  }

  // 1) Exact code match (highest confidence).
  if (wantCode) {
    const byCode = subjects.find((s) => normLabel(s.code) && normLabel(s.code) === wantCode);
    if (byCode) return { courseId: byCode.id, matchedName: byCode.name, confidence: 'high', code: byCode.code };
  }
  // 2) Exact name match.
  const byName = subjects.find((s) => normLabel(s.name) === want);
  if (byName) return { courseId: byName.id, matchedName: byName.name, confidence: 'high', code: byName.code };

  // 3) Expand a known abbreviation, then substring either direction.
  const expanded = ABBREV[want] || want;
  const bySub = subjects.find((s) => {
    const n = normLabel(s.name);
    return n && (n.includes(expanded) || expanded.includes(n));
  });
  if (bySub) return { courseId: bySub.id, matchedName: bySub.name, confidence: 'medium', code: bySub.code };

  // 4) No safe match — leave for admin review.
  return { courseId: null, matchedName: null, confidence: 'low', code: null };
}

/**
 * Detect overlapping entries on the same day. Returns an array of conflict
 * descriptors [{ a, b, day }] where a/b are indexes into the input array.
 */
function detectConflicts(entries = []) {
  const conflicts = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const aS = toMinutes(a.startTime);
      const aE = toMinutes(a.endTime);
      const bS = toMinutes(b.startTime);
      const bE = toMinutes(b.endTime);
      if (aS == null || bS == null) continue;
      // Overlap if one starts before the other ends (both ways).
      if (aS < bE && bS < aE) conflicts.push({ a: i, b: j, day: dayName(a.dayOfWeek) });
    }
  }
  return conflicts;
}

/* ------------------------------ public shapes ----------------------------- */

function toEntryView(row) {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    day: dayName(row.day_of_week),
    startTime: typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : row.start_time,
    endTime: typeof row.end_time === 'string' ? row.end_time.slice(0, 5) : row.end_time,
    subject: row.subject_name,
    subjectCode: row.subject_code || null,
    courseId: row.course_id || null,
    facultyId: row.faculty_id || null,
    faculty: row.faculty_name || null,
    room: row.room || null,
  };
}

/* ------------------------------ admin actions ----------------------------- */

/**
 * Validate + subject-match a set of DRAFT entries for a group WITHOUT saving.
 * Used by both the extraction preview and a manual add before persistence.
 * Returns { group, entries:[normalized+match], invalid:[{index,errors}], conflicts }.
 */
async function prepareDraft(groupInput, rawEntries = []) {
  const group = await subjectService.validateGroup(groupInput);
  const subjects = await subjectRepository.listByGroup(group);

  const entries = [];
  const invalid = [];
  rawEntries.forEach((raw, index) => {
    const norm = normalizeEntry(raw);
    if (!norm.ok) { invalid.push({ index, errors: norm.errors }); return; }
    const e = norm.entry;
    // Only auto-match when the admin hasn't already chosen a courseId.
    if (e.courseId == null) {
      const match = matchSubject(e.subjectName, e.subjectCode, subjects);
      e.courseId = match.courseId;
      e.matchConfidence = match.confidence;
      if (match.matchedName && match.confidence === 'high') e.subjectName = match.matchedName;
      if (match.code && !e.subjectCode) e.subjectCode = match.code;
    } else {
      e.matchConfidence = 'high'; // admin-chosen
    }
    entries.push(e);
  });

  const conflicts = detectConflicts(entries);
  return { group, entries, invalid, conflicts, subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })) };
}

/**
 * Persist a REVIEWED timetable for a group. Rejects if any entry is invalid.
 * Conflicts do NOT block saving (they are surfaced as a warning to the admin
 * during review) but are returned so the caller can echo them.
 */
async function saveTimetable(groupInput, rawEntries = [], { title = null, sourceKind = 'manual', createdBy = null } = {}) {
  const group = await subjectService.validateGroup(groupInput);

  // Integrity guard: a course_id on an entry MUST belong to THIS group's
  // subjects. This prevents a request from linking a slot to a subject from a
  // different course/branch/semester (the FK alone only proves existence). Any
  // courseId not in the group is dropped to NULL (kept as free-text subject).
  const groupSubjects = await subjectRepository.listByGroup(group);
  const validCourseIds = new Set(groupSubjects.map((s) => Number(s.id)));

  const entries = [];
  const invalid = [];
  rawEntries.forEach((raw, index) => {
    const norm = normalizeEntry(raw);
    if (!norm.ok) { invalid.push({ index, errors: norm.errors }); return; }
    const e = norm.entry;
    if (e.courseId != null && !validCourseIds.has(Number(e.courseId))) {
      e.courseId = null; // reject a foreign/mismatched subject reference
    }
    entries.push(e);
  });
  if (invalid.length) {
    throw new ApiError(400, 'Some timetable rows are invalid. Fix them before saving.', {
      code: 'INVALID_TIMETABLE_ENTRIES', details: invalid,
    });
  }
  if (!entries.length) {
    throw new ApiError(400, 'A timetable needs at least one valid entry.', { code: 'EMPTY_TIMETABLE' });
  }

  const conflicts = detectConflicts(entries);
  const saved = await timetableRepository.replaceForGroup({
    group, title, sourceKind, createdBy, entries,
  });
  const entryViews = saved.entries.map(toEntryView);

  // Best-effort: make the saved timetable RAG-searchable ("what's my timetable
  // this week?"). Never blocks or fails the save — indexing is a maintenance
  // side effect and degrades cleanly when AI/storage is unavailable.
  let indexed = null;
  try {
    const multimodalIngestService = require('./multimodalIngestService');
    indexed = await multimodalIngestService.ingestTimetable({
      timetableId: saved.timetable.id, group, entries: entryViews, title: saved.timetable.title,
    });
  } catch (err) {
    indexed = { status: 'skipped', reason: err && err.message };
  }

  return {
    timetable: { id: saved.timetable.id, ...group, title: saved.timetable.title, sourceKind: saved.timetable.source_kind },
    entries: entryViews,
    conflicts: conflicts.map((c) => ({ day: c.day })),
    indexed,
  };
}

/** Admin: read a group's saved timetable (validated group). */
async function getTimetableForGroup(groupInput) {
  const group = await subjectService.validateGroup(groupInput);
  const tt = await timetableRepository.findByGroup(group);
  if (!tt) return { ...group, exists: false, entries: [] };
  const rows = await timetableRepository.listEntries(tt.id);
  return { ...group, exists: true, id: tt.id, title: tt.title, sourceKind: tt.source_kind, entries: rows.map(toEntryView) };
}

/** Admin: delete a group's timetable. */
async function deleteTimetable(groupInput) {
  const group = await subjectService.validateGroup(groupInput);
  const removed = await timetableRepository.deleteByGroup(group);
  return { ...group, deleted: Boolean(removed) };
}

/* -------------------------- read for student/faculty ---------------------- */

/**
 * The authenticated STUDENT's own timetable (their program+branch+semester).
 * Identity comes from the resolved student profile — never from arguments.
 */
async function getForStudent(student, { dayOfWeek = null } = {}) {
  if (!student) return { exists: false, entries: [] };
  const rows = await timetableRepository.listEntriesForGroup({
    program: student.program, branch: student.branch, semester: student.semester, dayOfWeek,
  });
  return {
    program: student.program, branch: student.branch, semester: student.semester,
    exists: rows.length > 0, entries: rows.map(toEntryView),
  };
}

/** The authenticated FACULTY member's teaching slots (by faculty.id). */
async function getForFaculty(faculty, { dayOfWeek = null } = {}) {
  if (!faculty) return { exists: false, entries: [] };
  const rows = await timetableRepository.listEntriesForFaculty({ facultyId: faculty.id, dayOfWeek });
  return { exists: rows.length > 0, entries: rows.map((r) => ({ ...toEntryView(r), program: r.program, branch: r.branch, semester: r.semester })) };
}

module.exports = {
  // pure helpers (unit-tested)
  parseDay, dayName, parseTime, toMinutes, normalizeEntry, matchSubject, detectConflicts, normLabel,
  // shapes
  toEntryView, DAY_NAMES,
  // db-backed
  prepareDraft, saveTimetable, getTimetableForGroup, deleteTimetable, getForStudent, getForFaculty,
};
