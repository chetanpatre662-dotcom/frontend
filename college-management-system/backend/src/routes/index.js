/**
 * routes/index.js
 * -----------------------------------------------------------------------------
 * Root API router. Mounts all feature route modules under /api.
 *
 * Foundation phase mounts only health + auth probe. Business route modules
 * (students, faculty, classes, ...) will be added here after the database
 * schema exists.
 * -----------------------------------------------------------------------------
 */
'use strict';

const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
// Profile routes declare their own full paths (/students/profile,
// /faculty/profile, /profile/status), so mount at the API root.
router.use('/', profileRoutes);

module.exports = router;
