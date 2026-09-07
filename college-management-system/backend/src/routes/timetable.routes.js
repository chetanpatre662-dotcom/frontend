/**
 * routes/timetable.routes.js
 * -----------------------------------------------------------------------------
 * Read-only timetable endpoints for Student and Faculty panels. Admin timetable
 * CRUD lives in admin.routes.js (admin-only).
 *
 *   GET /api/students/timetable[?day=]
 *     - Auth required. Derives the academic group from the CURRENT student's own
 *       PostgreSQL profile (never from client params). Returns that group's
 *       timetable (optionally one weekday). 409 if the caller has no student
 *       profile.
 *
 *   GET /api/faculty/timetable[?day=]
 *     - Auth required; caller must be role 'faculty' or 'admin'. Returns the
 *       slots taught by THIS faculty (by faculty.id), never another person's.
 *
 * Identity is always resolved server-side from the verified token; no studentId
 * / facultyId is ever accepted from the client.
 * -----------------------------------------------------------------------------
 */
'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const timetableService = require('../services/timetableService');
const userRepository = require('../repositories/userRepository');
const studentRepository = require('../repositories/studentRepository');
const facultyRepository = require('../repositories/facultyRepository');
const ApiError = require('../utils/ApiError');

const router = express.Router();

/** Parse an optional ?day= param into 0..6 or null. */
function dayParam(req) {
  const raw = req.query.day;
  if (raw == null || raw === '') return null;
  return timetableService.parseDay(raw);
}

/** GET /api/students/timetable — the logged-in student's own timetable. */
router.get('/students/timetable', requireAuth, async (req, res, next) => {
  try {
    const user = await userRepository.findByFirebaseUid(req.user.uid);
    if (!user) return next(new ApiError(404, 'No application profile found.', { code: 'USER_NOT_FOUND' }));
    const student = await studentRepository.findByUserId(user.id);
    if (!student) {
      return next(new ApiError(409, 'Your student profile is incomplete. Please complete your profile first.', {
        code: 'NO_STUDENT_PROFILE',
      }));
    }
    const timetable = await timetableService.getForStudent(student, { dayOfWeek: dayParam(req) });
    res.status(200).json({ success: true, timetable });
  } catch (err) {
    next(err);
  }
});

/** GET /api/faculty/timetable — the logged-in faculty member's teaching slots. */
router.get('/faculty/timetable', requireAuth, async (req, res, next) => {
  try {
    const user = await userRepository.findByFirebaseUid(req.user.uid);
    if (!user || (user.role !== 'faculty' && user.role !== 'admin')) {
      return next(new ApiError(403, 'Faculty access required.', { code: 'FACULTY_REQUIRED' }));
    }
    const faculty = await facultyRepository.findByUserId(user.id);
    if (!faculty) {
      return next(new ApiError(409, 'Your faculty profile is incomplete. Please complete your profile first.', {
        code: 'NO_FACULTY_PROFILE',
      }));
    }
    const timetable = await timetableService.getForFaculty(faculty, { dayOfWeek: dayParam(req) });
    res.status(200).json({ success: true, timetable });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
