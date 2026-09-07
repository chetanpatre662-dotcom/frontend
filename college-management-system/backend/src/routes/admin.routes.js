/**
 * routes/admin.routes.js
 * -----------------------------------------------------------------------------
 * Admin-only user management. Every route is protected by:
 *   requireAuth   -> verifies the Firebase ID token, sets req.user (uid)
 *   requireAdmin  -> loads the PostgreSQL user, enforces role='admin', sets
 *                    req.dbUser (the verified admin)
 *
 * Role is never accepted from the client. The specific role transitions are
 * fixed by the endpoint (approve-faculty / make-admin), not by a body field.
 *
 *   GET    /api/admin/stats                       dashboard counts
 *   GET    /api/admin/users                       list users (+profiles)
 *   PATCH  /api/admin/users/:id/approve-faculty   student -> faculty
 *   PATCH  /api/admin/users/:id/make-admin        faculty -> admin
 *   DELETE /api/admin/users/:id                   delete user (PG + Firebase)
 * -----------------------------------------------------------------------------
 */
'use strict';

const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminService = require('../services/adminService');
const subjectService = require('../services/subjectService');
const catalogService = require('../services/catalogService');
const classAdminService = require('../services/classAdminService');
const timetableService = require('../services/timetableService');
const timetableExtractionService = require('../services/timetableExtractionService');
const ApiError = require('../utils/ApiError');

const router = express.Router();

// In-memory upload for timetable image/PDF extraction (never stored to disk).
// 25 MB mirrors storageService.MAX_BYTES.
const ttUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const TT_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// All admin routes require an authenticated admin.
router.use(requireAuth, requireAdmin);

/** GET /api/admin/stats */
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await adminService.getStats();
    res.status(200).json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users */
router.get('/users', async (_req, res, next) => {
  try {
    const users = await adminService.listUsers();
    res.status(200).json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/approve-faculty */
router.patch('/users/:id/approve-faculty', async (req, res, next) => {
  try {
    const result = await adminService.approveFaculty(req.params.id);
    res.status(200).json({
      success: true,
      message: result.changed ? 'Faculty approved.' : 'User is already faculty.',
      changed: result.changed,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/make-admin */
router.patch('/users/:id/make-admin', async (req, res, next) => {
  try {
    const result = await adminService.makeAdmin(req.params.id);
    res.status(200).json({
      success: true,
      message: result.changed ? 'User promoted to admin.' : 'User is already admin.',
      changed: result.changed,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/approve-admin — approve a pending/rejected admin applicant. */
router.patch('/users/:id/approve-admin', async (req, res, next) => {
  try {
    const result = await adminService.approveAdmin(req.params.id);
    res.status(200).json({
      success: true,
      message: result.changed ? 'Admin approved.' : 'Admin is already approved.',
      changed: result.changed,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/reject — mark a pending faculty/admin applicant rejected. */
router.patch('/users/:id/reject', async (req, res, next) => {
  try {
    const result = await adminService.rejectUser(req.params.id, req.dbUser);
    res.status(200).json({
      success: true,
      message: result.changed ? 'Applicant rejected.' : 'No change.',
      changed: result.changed,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/remove-admin — admin -> faculty (no delete). */
router.patch('/users/:id/remove-admin', async (req, res, next) => {
  try {
    const result = await adminService.removeAdmin(req.params.id, req.dbUser);
    res.status(200).json({
      success: true,
      message: result.changed ? 'Admin role removed.' : 'User is not an admin.',
      changed: result.changed,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/users/:id */
router.delete('/users/:id', async (req, res, next) => {
  try {
    // req.dbUser is the verified admin (from requireAdmin) — used for self-delete guard.
    const result = await adminService.deleteUser(req.params.id, req.dbUser);
    res.status(200).json({
      success: true,
      message: result.partialFailure
        ? 'User removed from the database, but the Firebase account could not be deleted. Please remove it manually.'
        : 'User deleted.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Subject management (Course + Branch + Semester -> subjects)         */
/* ------------------------------------------------------------------ */

/** GET /api/admin/subjects?program=&branch=&semester= — list subjects. */
router.get('/subjects', async (req, res, next) => {
  try {
    const subjects = await subjectService.listSubjects({
      program: req.query.program,
      branch: req.query.branch,
      semester: req.query.semester,
    });
    res.status(200).json({ success: true, subjects });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/subjects — create a subject. */
router.post('/subjects', async (req, res, next) => {
  try {
    const subject = await subjectService.createSubject(req.body || {}, req.dbUser ? req.dbUser.id : null);
    res.status(201).json({ success: true, message: 'Subject added.', subject });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/subjects/:id — update a subject. */
router.patch('/subjects/:id', async (req, res, next) => {
  try {
    const subject = await subjectService.updateSubject(req.params.id, req.body || {});
    res.status(200).json({ success: true, message: 'Subject updated.', subject });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/subjects/:id — delete a subject. */
router.delete('/subjects/:id', async (req, res, next) => {
  try {
    const subject = await subjectService.deleteSubject(req.params.id);
    res.status(200).json({ success: true, message: 'Subject deleted.', subject });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/subjects/bulk — create many subjects atomically. */
router.post('/subjects/bulk', async (req, res, next) => {
  try {
    const result = await subjectService.createSubjectsBulk(req.body || {}, req.dbUser ? req.dbUser.id : null);
    res.status(201).json({
      success: true,
      message: `Added ${result.created.length} subject(s).`,
      created: result.created,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Academic catalog: Courses + Branches (Option B)                     */
/* ------------------------------------------------------------------ */

/** GET /api/admin/courses — list courses (with branch counts). */
router.get('/courses', async (_req, res, next) => {
  try {
    const courses = await catalogService.listCourses();
    res.status(200).json({ success: true, courses });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/courses — create a course. */
router.post('/courses', async (req, res, next) => {
  try {
    const course = await catalogService.createCourse(req.body || {});
    res.status(201).json({ success: true, message: 'Course added.', course });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/courses/:id/branches — branches for a course. */
router.get('/courses/:id/branches', async (req, res, next) => {
  try {
    const branches = await catalogService.listBranches(req.params.id);
    res.status(200).json({ success: true, branches });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/courses/:id/branches — add a branch to a course. */
router.post('/courses/:id/branches', async (req, res, next) => {
  try {
    const branch = await catalogService.createBranch(req.params.id, req.body || {});
    res.status(201).json({ success: true, message: 'Branch added.', branch });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Classes (real DB): list + delete + filter options                   */
/* ------------------------------------------------------------------ */

/** GET /api/admin/classes?program=&branch=&semester=&facultyId= */
router.get('/classes', async (req, res, next) => {
  try {
    const classes = await classAdminService.listClasses({
      program: req.query.program,
      branch: req.query.branch,
      semester: req.query.semester,
      facultyId: req.query.facultyId,
    });
    res.status(200).json({ success: true, classes });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/classes/faculty-options — faculty that own classes. */
router.get('/classes/faculty-options', async (_req, res, next) => {
  try {
    const faculty = await classAdminService.facultyFilterOptions();
    res.status(200).json({ success: true, faculty });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/classes/:id */
router.delete('/classes/:id', async (req, res, next) => {
  try {
    const result = await classAdminService.deleteClass(req.params.id);
    res.status(200).json({ success: true, message: 'Class deleted.', ...result });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Timetable (admin): extract -> review -> save. Scoped to the same    */
/* (program, branch, semester) group used by Subjects. Extraction NEVER */
/* auto-publishes — it returns a draft the admin reviews + confirms.    */
/* ------------------------------------------------------------------ */

/**
 * POST /api/admin/timetables/extract  (multipart OR json)
 * Fields: program, branch, semester, inputType(image|pdf|text|url),
 *         text? (for text), url? (for url), file? (for image/pdf).
 * Returns a DRAFT: { group, entries, invalid, conflicts, subjects, extractedCount }.
 */
router.post('/timetables/extract', ttUpload.single('file'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const inputType = String(body.inputType || '').toLowerCase();
    const group = { program: body.program, branch: body.branch, semester: body.semester };

    if (!['image', 'pdf', 'text', 'url'].includes(inputType)) {
      throw new ApiError(400, 'inputType must be one of image, pdf, text, url.', { code: 'VALIDATION_ERROR' });
    }

    const params = { group, inputType };
    if (inputType === 'image' || inputType === 'pdf') {
      const file = req.file;
      if (!file || !file.buffer || !file.buffer.length) {
        throw new ApiError(400, 'A file is required for image/PDF extraction.', { code: 'VALIDATION_ERROR' });
      }
      if (inputType === 'image' && !TT_IMAGE_MIME.has(file.mimetype)) {
        throw new ApiError(415, 'Unsupported image type. Allowed: JPEG, PNG, WebP, GIF.', { code: 'UNSUPPORTED_TYPE' });
      }
      if (inputType === 'pdf' && file.mimetype !== 'application/pdf') {
        throw new ApiError(415, 'A PDF file is required.', { code: 'UNSUPPORTED_TYPE' });
      }
      params.buffer = file.buffer;
      params.mimeType = file.mimetype;
    } else if (inputType === 'text') {
      params.text = String(body.text || '');
    } else if (inputType === 'url') {
      params.url = String(body.url || '');
    }

    const draft = await timetableExtractionService.extractDraft(params);
    if (draft && draft.error) {
      throw new ApiError(400, draft.error, { code: 'EXTRACTION_ERROR' });
    }
    res.status(200).json({ success: true, draft });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/timetables?program=&branch=&semester= — the saved timetable. */
router.get('/timetables', async (req, res, next) => {
  try {
    const timetable = await timetableService.getTimetableForGroup({
      program: req.query.program, branch: req.query.branch, semester: req.query.semester,
    });
    res.status(200).json({ success: true, timetable });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/timetables — save/replace a group's REVIEWED timetable.
 * Body: { program, branch, semester, title?, sourceKind?, entries:[...] }.
 */
router.put('/timetables', async (req, res, next) => {
  try {
    const body = req.body || {};
    const group = { program: body.program, branch: body.branch, semester: body.semester };
    const result = await timetableService.saveTimetable(group, body.entries || [], {
      title: body.title || null,
      sourceKind: body.sourceKind || 'manual',
      createdBy: req.dbUser ? req.dbUser.id : null,
    });
    res.status(200).json({ success: true, message: 'Timetable saved.', ...result });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/timetables?program=&branch=&semester= — remove a timetable. */
router.delete('/timetables', async (req, res, next) => {
  try {
    const result = await timetableService.deleteTimetable({
      program: req.query.program, branch: req.query.branch, semester: req.query.semester,
    });
    res.status(200).json({ success: true, message: result.deleted ? 'Timetable deleted.' : 'No timetable to delete.', ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
