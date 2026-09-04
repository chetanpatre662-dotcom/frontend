/**
 * studentClassService.js — Automatic academic class membership (frontend model).
 * -----------------------------------------------------------------------------
 * CORE BUSINESS RULE (frontend mirror of future backend authorization):
 *
 *   A student is automatically a member of a class when:
 *     student.program  === class.program
 *     student.branch   === class.branch
 *     student.semester === class.semester
 *
 * Students never "join" a class manually — membership is derived from the
 * student's structured academic profile. Matching uses structured fields, NOT
 * display text.
 *
 * SECURITY NOTE: This frontend matching is for UX only. The real membership /
 * authorization check MUST be enforced by the backend (keyed by Firebase UID +
 * the student's server-side academic profile). Never trust this in production
 * for access control.
 * -----------------------------------------------------------------------------
 */
import { latency } from './apiClient.js';
import { getClasses } from './classService.js';
import { getStudents } from './studentService.js';

/** Normalize the program field regardless of whether a record uses program/course. */
function programOf(record) {
  return record.program || record.course || null;
}

/**
 * Structured academic match. Returns true if the student's academic profile
 * matches the class's target program/branch/semester.
 */
export function isStudentInClass(student, cls) {
  if (!student || !cls) return false;
  return (
    programOf(student) === programOf(cls) &&
    student.branch === cls.branch &&
    Number(student.semester) === Number(cls.semester)
  );
}

/**
 * All classes a student is automatically enrolled in (active classes only),
 * newest first. `profile` = { program|course, branch, semester }.
 */
export async function getClassesForStudent(profile) {
  await latency();
  const all = await getClasses();
  return all
    .filter((c) => c.status === 'active' && isStudentInClass(profile, c))
    .sort((a, b) => new Date(b.created) - new Date(a.created));
}

/**
 * The list of students that automatically belong to a given class.
 * Used by faculty/admin "Members" views.
 */
export async function getClassMembers(cls) {
  await latency();
  const students = await getStudents();
  return students.filter((s) => isStudentInClass(s, cls));
}

/** Count of matching students for a class (derived, not stored). */
export async function countClassMembers(cls) {
  return (await getClassMembers(cls)).length;
}
