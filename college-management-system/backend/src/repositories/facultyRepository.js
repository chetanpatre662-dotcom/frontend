/**
 * repositories/facultyRepository.js
 * -----------------------------------------------------------------------------
 * Data-access layer for the `faculty` table. Parameterized SQL only.
 *
 * Schema reference (001 + 002 + 012):
 *   faculty(id, user_id UNIQUE -> users, employee_id UNIQUE NULLABLE,
 *           full_name, mobile_number, department, designation,
 *           qualification, subjects_handled,
 *           profile_photo_url, created_at, updated_at)
 *
 * employee_id is intentionally NOT set during public registration — an admin
 * assigns it later. Public registration inserts NULL for employee_id.
 * -----------------------------------------------------------------------------
 */
'use strict';

const { query } = require('../config/database');

const RETURNING =
  'id, user_id, employee_id, full_name, mobile_number, department, designation, ' +
  'qualification, subjects_handled, profile_photo_url, created_at, updated_at';

/** Find a faculty profile by the owning user id. */
async function findByUserId(userId) {
  const { rows } = await query(
    `SELECT ${RETURNING} FROM faculty WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Insert or update the faculty profile for a user (one profile per user).
 * Does NOT touch employee_id (kept as-is / NULL until an admin assigns it).
 * qualification + subjects_handled are optional (nullable) free-text fields.
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
     RETURNING ${RETURNING}`,
    [userId, fullName, mobileNumber, department, designation, qualification, subjectsHandled]
  );
  return rows[0];
}

module.exports = { findByUserId, upsertByUserId };
