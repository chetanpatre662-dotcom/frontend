/**
 * services/profileService.js
 * -----------------------------------------------------------------------------
 * Business logic for completing and reading Student/Faculty profiles, keyed to
 * the verified Firebase identity (via the PostgreSQL users row).
 *
 * SECURITY:
 *   - Role is server-owned. Nothing here reads or accepts a role from the
 *     client. Students self-provision as role 'student' (via userService).
 *     Faculty submitting a profile do NOT gain the 'faculty' role — that stays
 *     'student' until an admin promotes them (Option A). The route/response
 *     surfaces a "faculty pending" state so the frontend can gate access.
 *   - All domain values (program/branch/semester/department/designation) are
 *     re-validated here regardless of any frontend validation.
 * -----------------------------------------------------------------------------
 */
'use strict';

const userRepository = require('../repositories/userRepository');
const studentRepository = require('../repositories/studentRepository');
const facultyRepository = require('../repositories/facultyRepository');
const ApiError = require('../utils/ApiError');

/* ---- Authoritative domain constants (server side is the source of truth) ---- */
const PROGRAMS = ['Polytechnic', 'B.Tech'];
const BRANCHES = ['Computer Science', 'Mining', 'Electrical', 'Civil', 'Mechanical'];
const DEPARTMENTS = BRANCHES.slice();
const DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'HOD',
  'Lecturer',
  'Lab Instructor',
];
const MAX_SEMESTER = { 'B.Tech': 8, Polytechnic: 6 };

/** Mobile: 10–15 digits, optional leading +. */
const MOBILE_RE = /^\+?\d{10,15}$/;

function isNonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Resolve the current PostgreSQL user for a verified UID, or 404. */
async function requireDbUser(firebaseUid) {
  const user = await userRepository.findByFirebaseUid(firebaseUid);
  if (!user) {
    throw new ApiError(404, 'No application profile found for this account.', {
      code: 'USER_NOT_FOUND',
    });
  }
  return user;
}

/**
 * Validate + save a student profile for the current verified user.
 * @param {string} firebaseUid - trusted UID from requireAuth
 * @param {object} input - { rollNumber, fullName, mobileNumber, program, branch, semester }
 */
async function saveStudentProfile(firebaseUid, input = {}) {
  const user = await requireDbUser(firebaseUid);

  const rollNumber = String(input.rollNumber || '').trim();
  const fullName = String(input.fullName || '').trim();
  const mobileNumber = String(input.mobileNumber || '').trim();
  const program = String(input.program || '').trim();
  const branch = String(input.branch || '').trim();
  const semester = Number(input.semester);

  const errors = [];
  if (!isNonEmpty(fullName)) errors.push('fullName is required.');
  if (!isNonEmpty(rollNumber)) errors.push('rollNumber is required.');
  if (!MOBILE_RE.test(mobileNumber)) errors.push('A valid mobileNumber is required.');
  if (!PROGRAMS.includes(program)) errors.push('program must be Polytechnic or B.Tech.');
  if (!BRANCHES.includes(branch)) errors.push('branch is invalid.');
  if (!Number.isInteger(semester) || semester < 1 || semester > (MAX_SEMESTER[program] || 0)) {
    errors.push(`semester must be between 1 and ${MAX_SEMESTER[program] || '?'} for ${program || 'the selected program'}.`);
  }
  if (errors.length) {
    throw new ApiError(400, errors.join(' '), { code: 'VALIDATION_ERROR' });
  }

  // Roll number must be unique across other users.
  if (await studentRepository.rollNumberTakenByOther(rollNumber, user.id)) {
    throw new ApiError(409, 'This roll number is already registered.', {
      code: 'ROLL_NUMBER_TAKEN',
    });
  }

  const profile = await studentRepository.upsertByUserId({
    userId: user.id,
    rollNumber,
    fullName,
    mobileNumber,
    program,
    branch,
    semester,
  });

  return profile;
}

/**
 * Validate + save a faculty profile for the current verified user.
 * Does NOT change the user's role (stays 'student' until admin promotion).
 * @param {string} firebaseUid
 * @param {object} input - { fullName, mobileNumber, department, designation }
 */
async function saveFacultyProfile(firebaseUid, input = {}) {
  const user = await requireDbUser(firebaseUid);

  const fullName = String(input.fullName || '').trim();
  const mobileNumber = String(input.mobileNumber || '').trim();
  const department = String(input.department || '').trim();
  const designation = String(input.designation || '').trim();

  const errors = [];
  if (!isNonEmpty(fullName)) errors.push('fullName is required.');
  if (!MOBILE_RE.test(mobileNumber)) errors.push('A valid mobileNumber is required.');
  if (!DEPARTMENTS.includes(department)) errors.push('department is invalid.');
  if (!DESIGNATIONS.includes(designation)) errors.push('designation is invalid.');
  if (errors.length) {
    throw new ApiError(400, errors.join(' '), { code: 'VALIDATION_ERROR' });
  }

  const profile = await facultyRepository.upsertByUserId({
    userId: user.id,
    fullName,
    mobileNumber,
    department,
    designation,
  });

  // Mark the account as pending approval (explicit status model). The ROLE is
  // intentionally left as-is (Option A: stays 'student' until an admin/ OTP
  // approval promotes it to 'faculty'), which keeps the existing admin-panel
  // pending detection working. Never downgrade an already-approved faculty.
  if (user.status !== 'approved' || user.role !== 'faculty') {
    try {
      if (user.status !== 'pending' && user.role !== 'faculty') {
        await userRepository.updateStatus(user.id, 'pending');
      }
    } catch (e) {
      // Non-fatal: the profile is saved; status default remains.
      console.debug('[profile] could not set faculty pending status:', e.message);
    }
  }

  return profile;
}

/**
 * Compute the profile/completion status for the current user. Used by the
 * frontend to decide dashboard access vs. profile-completion vs. faculty
 * "approval pending".
 *
 * facultyPending is true when a faculty profile exists but the DB role has not
 * yet been promoted to 'faculty' (Option A security model).
 *
 * @param {string} firebaseUid
 */
async function getProfileStatus(firebaseUid) {
  const user = await requireDbUser(firebaseUid);
  const [student, faculty] = await Promise.all([
    studentRepository.findByUserId(user.id),
    facultyRepository.findByUserId(user.id),
  ]);

  return {
    role: user.role, // server-owned source of truth
    status: user.status, // 'pending' | 'approved' | 'rejected'
    hasStudentProfile: Boolean(student),
    hasFacultyProfile: Boolean(faculty),
    // A faculty applicant is "pending" until approved (role promoted to faculty
    // AND status approved). Approval happens via admin panel OR OTP.
    facultyPending: Boolean(faculty) && !(user.role === 'faculty' && user.status === 'approved'),
    // An admin applicant is "pending" until status is approved.
    adminPending: user.role === 'admin' && user.status !== 'approved',
    student: student || null,
    faculty: faculty || null,
  };
}

module.exports = {
  saveStudentProfile,
  saveFacultyProfile,
  getProfileStatus,
  // exported for potential reuse/testing
  PROGRAMS,
  BRANCHES,
  DEPARTMENTS,
  DESIGNATIONS,
  MAX_SEMESTER,
};
