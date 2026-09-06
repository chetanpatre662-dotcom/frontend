/**
 * routes/ai.routes.js
 * -----------------------------------------------------------------------------
 * AI Assistant endpoints. Mounted at /api. Every route requires a valid Firebase
 * token (requireAuth); the acting user is resolved server-side from the token
 * (userRepository.findByFirebaseUid) — userId/role are NEVER taken from the body.
 *
 *   POST /api/ai/chat            ask a question (tool-calling + RAG + memory)
 *   GET  /api/ai/conversations   list the caller's own chat threads
 *   POST /api/ai/ingest          (admin) build/refresh the RAG document index
 *
 * Responses follow the app convention: { success: true, ... } / errors via
 * ApiError -> central errorHandler. No API keys, DB details, stack traces, or
 * raw tool output leak to the client.
 * -----------------------------------------------------------------------------
 */
'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const userRepository = require('../repositories/userRepository');
const aiOrchestrator = require('../services/aiOrchestrator');
const documentIngestService = require('../services/documentIngestService');
const ApiError = require('../utils/ApiError');

const router = express.Router();

/** Resolve the current DB user from the verified token (identity source). */
async function currentUser(req) {
  const user = await userRepository.findByFirebaseUid(req.user.uid);
  if (!user) throw new ApiError(404, 'No application profile found.', { code: 'USER_NOT_FOUND' });
  return user;
}

/**
 * POST /api/ai/chat
 * Body: { message: string, conversationId?: number }
 * Returns: { success, answer, sources, conversationId, toolsUsed }
 */
router.post('/ai/chat', requireAuth, async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const body = req.body || {};

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      throw new ApiError(400, 'A message is required.', { code: 'VALIDATION_ERROR' });
    }
    if (message.length > 4000) {
      throw new ApiError(413, 'Message is too long (max 4000 characters).', { code: 'MESSAGE_TOO_LONG' });
    }
    // conversationId (optional) must be a positive integer if provided.
    let conversationId = null;
    if (body.conversationId != null) {
      const cid = Number(body.conversationId);
      if (!Number.isInteger(cid) || cid <= 0) {
        throw new ApiError(400, 'Invalid conversationId.', { code: 'VALIDATION_ERROR' });
      }
      conversationId = cid;
    }

    const result = await aiOrchestrator.ask({ user, message, conversationId });

    res.status(200).json({
      success: true,
      answer: result.answer,
      sources: result.sources || [],
      conversationId: result.conversationId,
      toolsUsed: result.toolsUsed || [],
      degraded: Boolean(result.degraded),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/conversations?limit=30
 * Returns the caller's own conversation threads (ownership enforced in SQL).
 */
router.get('/ai/conversations', requireAuth, async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const conversations = await aiOrchestrator.listConversations(user, limit);
    res.status(200).json({
      success: true,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Parse + validate a positive-integer :id route param, or throw 400. */
function parseId(raw, label = 'id') {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `Invalid ${label}.`, { code: 'VALIDATION_ERROR' });
  }
  return n;
}

/**
 * GET /api/ai/conversations/:id
 * Returns one conversation WITH its full message thread — only if owned by the
 * caller. A non-owned/absent id returns 404 (no existence leak).
 */
router.get('/ai/conversations/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const id = parseId(req.params.id, 'conversation id');
    const conversation = await aiOrchestrator.getConversation(user, id);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found.', { code: 'CONVERSATION_NOT_FOUND' });
    }
    res.status(200).json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/ai/conversations/:id   Body: { title }
 * Rename a conversation the caller owns.
 */
router.patch('/ai/conversations/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const id = parseId(req.params.id, 'conversation id');
    const title = typeof (req.body || {}).title === 'string' ? req.body.title.trim() : '';
    if (!title) throw new ApiError(400, 'A title is required.', { code: 'VALIDATION_ERROR' });
    if (title.length > 200) throw new ApiError(413, 'Title is too long.', { code: 'TITLE_TOO_LONG' });
    const updated = await aiOrchestrator.renameConversation(user, id, title);
    if (!updated) throw new ApiError(404, 'Conversation not found.', { code: 'CONVERSATION_NOT_FOUND' });
    res.status(200).json({
      success: true,
      conversation: { id: updated.id, title: updated.title, updatedAt: updated.updated_at },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/ai/conversations/:id
 * Delete a conversation the caller owns (messages cascade). 404 otherwise.
 */
router.delete('/ai/conversations/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const id = parseId(req.params.id, 'conversation id');
    const ok = await aiOrchestrator.deleteConversation(user, id);
    if (!ok) throw new ApiError(404, 'Conversation not found.', { code: 'CONVERSATION_NOT_FOUND' });
    res.status(200).json({ success: true, deleted: id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/ingest  (ADMIN ONLY)
 * Body: { sourceType?, sourceId?, classId?, limit? }
 *   - sourceType + sourceId => ingest ONE document
 *   - sourceType (+ optional classId) => bulk ingest that type
 *   - no body => ingest all supported types
 * Returns a per-source summary (indexed/skipped/failed + reasons). Never fakes
 * success: un-extractable/failed documents are reported as such.
 */
router.post('/ai/ingest', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const sourceType = body.sourceType ? String(body.sourceType) : null;

    if (sourceType && body.sourceId != null) {
      const sourceId = Number(body.sourceId);
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        throw new ApiError(400, 'Invalid sourceId.', { code: 'VALIDATION_ERROR' });
      }
      const result = await documentIngestService.ingestSource(sourceType, sourceId);
      return res.status(200).json({ success: true, result });
    }

    const classId = body.classId != null ? Number(body.classId) : null;
    const limit = body.limit != null ? Number(body.limit) : 500;
    const report = await documentIngestService.ingestAll({ sourceType, classId, limit });
    return res.status(200).json({ success: true, ...report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
