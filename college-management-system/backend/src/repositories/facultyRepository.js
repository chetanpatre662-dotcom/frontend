/**
 * repositories/facultyRepository.js
 * -----------------------------------------------------------------------------
 * Data-access layer for the `faculty` table. Parameterized SQL only.
 *
 * Schema reference (001 + 002 + 012):
 *   faculty(id, user_id UNIQUE -> users, employee_id UNIQUE NULLABLE,
 *           full_name, mobile_number, department, designation,
 *           qualification TEXT,        -- added by migration 012
 *           subjects_handled TEXT,     -- added by migration 012
 *           profile_photo_url, created_at, updated_at)
 *
 * employee_id is intentionally NOT set during public registration — an admin
 * assigns it later. Public registration inserts NULL for employee_id.
 *
 * MIGRATION GUARD: qualification + subjects_handled exist after migration 012.
 * If the migration has not been applied yet the queries fall back to the base
 * column set so the rest of the app (all three portals' profile pages) keeps
 * working rather than returning 500. A clear warning is logged so operators
 * know to run `npm run migrate`. Once migration 012 is applied, the guard is
 * a no-op and full functionality is restored automatically.
 * -----------------------------------------------------------------------------
 */
'use strict';

const { query } = require('../config/database');

// Base columns that have always existed (001 schema).
const RETURNING_BASE =
  'id, user_id, employee_id, full_name, mobile_number, department, designation, ' +
  'profile_photo_url, created_at, updated_at';

// Full column list including migration-012 additions.
const RETURNING_FULL =
  'id, user_id, employee_id, full_name, mobile_number, department, designation, ' +
  'qualification, subjects_handled, profile_photo_url, created_at, updated_at';

/**
 * Runtime flag: true once we have confirmed the migration-012 columns exist (or
 * definitively do not). Avoids a schema-check round-trip on every call after the
 * first successful query.
 *   null  — not yet checked
 *   true  — columns confirmed present; use RETURNING_FULL
 *   false — columns absent; use RETURNING_BASE (migration pending)
 */
let _columnsAvailable = null;

/** Augment a base row with null stubs for the optional columns. */
function withStubs(row) {
  if (!row) return null;
  return { ...row, qualification: null, subjects_handled: null };
}

/**
 * Find a faculty profile by the owning user id.
 * Falls back to base columns if migration 012 has not been applied yet.
 */
async function findByUserId(userId) {
  // Fast path: we already know whether the columns exist.
  if (_columnsAvailable === true) {
    const { rows } = await query(
      `SELECT ${RETURNING_FULL} FROM faculty WHERE user_id = $1`, [userId]
    );
    return rows[0] || null;
  }
  if (_columnsAvailable === false) {
    const { rows } = await query(
      `SELECT ${RETURNING_BASE} FROM faculty WHERE user_id = $1`, [userId]
    );
    return withStubs(rows[0] || null);
  }

  // First call — probe with the full column list.
  try {
    const { rows } = await query(
      `SELECT ${RETURNING_FULL} FROM faculty WHERE user_id = $1`, [userId]
    );
    _columnsAvailable = true;
    return rows[0] || null;
  } catch (err) {
    // 42703 = undefined_column (PostgreSQL SQLSTATE).
    if (err.code === '42703') {
      console.warn(
        '[facultyRepository] migration 012 has not been applied — ' +
        'qualification/subjects_handled columns are missing. ' +
        'Run `npm run migrate` on the production server to apply it. ' +
        'Falling back to base columns until migration is applied.'
      );
      _columnsAvailable = false;
      const { rows } = await query(
        `SELECT ${RETURNING_BASE} FROM faculty WHERE user_id = $1`, [userId]
      );
      return withStubs(rows[0] || null);
    }
    throw err; // unexpected error — re-throw
  }
}

/**
 * Insert or update the faculty profile for a user (one profile per user).
 * Does NOT touch employee_id (kept as-is / NULL until an admin assigns it).
 * qualification + subjects_handled are optional (nullable) free-text fields
 * added by migration 012. Falls back to the base columns if missing.
 * @param {object} p
 * @param {number} p.userId
 * @param {string} p.fullName
 * @param {string} p.mobileNumber
 * @param {string} p.department
 * @param {string} p.designation
 * @param {string} [p.qualification]
 * @param {string} [p.subjectsHandled]
 */
async function upsertByUserId({
  userId, fullName, mobileNumber, department, designation,
  qualification = null, subjectsHandled = null,
}) {
  // After findByUserId has been called at least once, _columnsAvailable is set.
  // Proactively probe if still unknown.
  if (_columnsAvailable === null) {
    await findByUserId(userId); // sets _columnsAvailable as a side-effect
  }

  if (_columnsAvailable === true) {
    const { rows } = await query(
      `INSERT INTO faculty
         (user_id, full_name, mobile_number, department, designation, qualification, subjects_handled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
         SET full_name        = EXCLUDED.full_name,
             mobile_number    = EXCLUDED.mobile_number,
             department       = EXCLUDED.department,
             designation      = EXCLUDED.designation,
             qualification    = EXCLUDED.qualification,
             subjects_handled = EXCLUDED.subjects_handled
       RETURNING ${RETURNING_FULL}`,
      [userId, fullName, mobileNumber, department, designation, qualification, subjectsHandled]
    );
    return rows[0];
  }

  // Migration 012 not yet applied — save without the new columns.
  const { rows } = await query(
    `INSERT INTO faculty
       (user_id, full_name, mobile_number, department, designation)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET full_name     = EXCLUDED.full_name,
           mobile_number = EXCLUDED.mobile_number,
           department    = EXCLUDED.department,
           designation   = EXCLUDED.designation
     RETURNING ${RETURNING_BASE}`,
    [userId, fullName, mobileNumber, department, designation]
  );
  return withStubs(rows[0]);
}

/** Reset the column-availability cache (used in tests). */
function _resetCache() { _columnsAvailable = null; }

module.exports = { findByUserId, upsertByUserId, _resetCache };
