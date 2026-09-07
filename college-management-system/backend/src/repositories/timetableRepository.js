/**
 * repositories/timetableRepository.js
 * -----------------------------------------------------------------------------
 * Data-access for TIMETABLES. A timetable belongs to exactly one academic group
 * (program + branch + semester) and owns a set of weekly slots
 * (timetable_entries). Parameterized SQL only.
 *
 * Column mapping (see migration 013):
 *   timetables.program/branch/semester  <-> the academic group key
 *   timetable_entries.day_of_week        <-> 0=Mon … 6=Sun
 *   timetable_entries.course_id          <-> courses.id (a real subject) | NULL
 *   timetable_entries.faculty_id         <-> faculty.id | NULL
 * -----------------------------------------------------------------------------
 */
'use strict';

const { query, pool } = require('../config/database');

const TT_COLS =
  'id, program, branch, semester, title, source_kind, created_by, created_at, updated_at';
const ENTRY_COLS =
  'id, timetable_id, day_of_week, start_time, end_time, course_id, subject_name, subject_code, faculty_id, faculty_name, room, created_at, updated_at';

/** Find the single timetable for an academic group (or null). */
async function findByGroup({ program, branch, semester }) {
  const { rows } = await query(
    `SELECT ${TT_COLS} FROM timetables
      WHERE program = $1 AND branch = $2 AND semester = $3`,
    [program, branch, Number(semester)]
  );
  return rows[0] || null;
}

/** Find a timetable by id (or null). */
async function findById(id) {
  const { rows } = await query(`SELECT ${TT_COLS} FROM timetables WHERE id = $1`, [Number(id)]);
  return rows[0] || null;
}

/** List a timetable's entries, ordered for display (day then start time). */
async function listEntries(timetableId) {
  const { rows } = await query(
    `SELECT ${ENTRY_COLS} FROM timetable_entries
      WHERE timetable_id = $1
      ORDER BY day_of_week ASC, start_time ASC, id ASC`,
    [Number(timetableId)]
  );
  return rows;
}

/**
 * List entries for an academic group by joining through the group's timetable.
 * Optional dayOfWeek filter (0..6). Returns [] when the group has no timetable.
 * Used by the AI tool + student/faculty read route (identity resolved upstream).
 */
async function listEntriesForGroup({ program, branch, semester, dayOfWeek = null }) {
  const params = [program, branch, Number(semester)];
  let dayFilter = '';
  if (dayOfWeek != null) {
    params.push(Number(dayOfWeek));
    dayFilter = `AND e.day_of_week = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT e.id, e.timetable_id, e.day_of_week, e.start_time, e.end_time,
            e.course_id, e.subject_name, e.subject_code, e.faculty_id,
            e.faculty_name, e.room
       FROM timetable_entries e
       JOIN timetables t ON t.id = e.timetable_id
      WHERE t.program = $1 AND t.branch = $2 AND t.semester = $3 ${dayFilter}
      ORDER BY e.day_of_week ASC, e.start_time ASC, e.id ASC`,
    params
  );
  return rows;
}

/**
 * List entries taught by a specific faculty (faculty.id), optionally on one day.
 * Only returns entries whose faculty_id matches — never fabricated.
 */
async function listEntriesForFaculty({ facultyId, dayOfWeek = null }) {
  const params = [Number(facultyId)];
  let dayFilter = '';
  if (dayOfWeek != null) {
    params.push(Number(dayOfWeek));
    dayFilter = `AND e.day_of_week = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT e.id, e.timetable_id, e.day_of_week, e.start_time, e.end_time,
            e.course_id, e.subject_name, e.subject_code, e.faculty_id,
            e.faculty_name, e.room,
            t.program, t.branch, t.semester
       FROM timetable_entries e
       JOIN timetables t ON t.id = e.timetable_id
      WHERE e.faculty_id = $1 ${dayFilter}
      ORDER BY e.day_of_week ASC, e.start_time ASC, e.id ASC`,
    params
  );
  return rows;
}

/**
 * Replace a group's ENTIRE timetable atomically: upsert the timetables row for
 * the group, delete its old entries, insert the provided ones. Either the whole
 * new timetable is saved or nothing changes.
 *
 * @param {object} p
 * @param {{program,branch,semester}} p.group  normalized academic group
 * @param {string} [p.title]
 * @param {string} [p.sourceKind]  manual|image|pdf|text|url
 * @param {number|null} [p.createdBy]
 * @param {Array} p.entries  [{ dayOfWeek, startTime, endTime, courseId?, subjectName, subjectCode?, facultyId?, facultyName?, room? }]
 * @returns {Promise<{ timetable: object, entries: object[] }>}
 */
async function replaceForGroup({ group, title = null, sourceKind = 'manual', createdBy = null, entries = [] }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert the timetable row for this exact group.
    const ttRes = await client.query(
      `INSERT INTO timetables (program, branch, semester, title, source_kind, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (program, branch, semester) DO UPDATE
         SET title = EXCLUDED.title,
             source_kind = EXCLUDED.source_kind,
             updated_at = NOW()
       RETURNING ${TT_COLS}`,
      [group.program, group.branch, Number(group.semester), title, sourceKind, createdBy]
    );
    const timetable = ttRes.rows[0];

    // Clear old entries, then insert the fresh set.
    await client.query('DELETE FROM timetable_entries WHERE timetable_id = $1', [timetable.id]);

    const inserted = [];
    for (const e of entries) {
      // eslint-disable-next-line no-await-in-loop
      const r = await client.query(
        `INSERT INTO timetable_entries
           (timetable_id, day_of_week, start_time, end_time, course_id,
            subject_name, subject_code, faculty_id, faculty_name, room)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${ENTRY_COLS}`,
        [
          timetable.id,
          Number(e.dayOfWeek),
          e.startTime,
          e.endTime,
          e.courseId != null ? Number(e.courseId) : null,
          e.subjectName,
          e.subjectCode || null,
          e.facultyId != null ? Number(e.facultyId) : null,
          e.facultyName || null,
          e.room || null,
        ]
      );
      inserted.push(r.rows[0]);
    }

    await client.query('COMMIT');
    return { timetable, entries: inserted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Delete a group's timetable (entries cascade). Returns the deleted row/null. */
async function deleteByGroup({ program, branch, semester }) {
  const { rows } = await query(
    `DELETE FROM timetables
      WHERE program = $1 AND branch = $2 AND semester = $3
      RETURNING ${TT_COLS}`,
    [program, branch, Number(semester)]
  );
  return rows[0] || null;
}

module.exports = {
  findByGroup,
  findById,
  listEntries,
  listEntriesForGroup,
  listEntriesForFaculty,
  replaceForGroup,
  deleteByGroup,
};
