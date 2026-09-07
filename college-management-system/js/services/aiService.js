/**
 * aiService.js — AI Assistant client (FRONTEND).
 * -----------------------------------------------------------------------------
 * Calls the real Askbook backend AI Assistant:  POST /api/ai/chat
 *
 * The backend (aiOrchestrator) runs Google Gemini with server-side tool-calling,
 * RAG over college documents, role-based authorization and conversation memory.
 * The Gemini API key lives ONLY on the server — it is never exposed here, in the
 * browser, in localStorage, or in any response.
 *
 * ask() returns a reply object the shared chat UI understands:
 *   { role:'assistant', text, sources:[...], conversationId, at }
 *
 * Never throws: on any transport/auth error it returns a friendly assistant
 * message so the UI can render an error bubble (graceful degradation).
 * -----------------------------------------------------------------------------
 */
import { ENV } from '../config.js';
import { getIdToken } from '../firebase/auth.js';
import { authedRequest, authedUpload } from './apiClient.js';

/** Role-specific suggested prompts shown in the empty state. */
export function suggestedPrompts(role) {
  if (role === 'faculty') {
    return [
      'Show my active classes',
      'Summarize my recent announcements',
      'List my question papers',
      'What can you help me with?',
    ];
  }
  if (role === 'admin') {
    return [
      'What are the latest announcements?',
      'What upcoming events are there?',
      'What can you do?',
    ];
  }
  return [
    'Show my classes this semester',
    'Which question papers are available to me?',
    'Any announcements relevant to me?',
    'Find repeated questions in my previous papers',
  ];
}

function reply(text, extra = {}) {
  return { role: 'assistant', text, sources: [], at: new Date().toISOString(), ...extra };
}

/**
 * Ask the backend AI Assistant a question, optionally with a file attachment.
 * When `file` is provided the request is sent as multipart (authedUpload);
 * otherwise a plain JSON request is used. The Gemini key stays server-side.
 * @param {object} p
 * @param {string} p.text            - the user's message
 * @param {number} [p.conversationId] - continue an existing thread
 * @param {File}   [p.file]          - optional attachment (image/PDF/DOCX/TXT)
 * @returns {Promise<object>} assistant reply object (never throws)
 */
export async function ask({ text, conversationId, file } = {}) {
  const message = String(text || '').trim();
  if (!message && !file) return reply('Please type a question.');

  if (!ENV.AUTH_USE_BACKEND) {
    return reply('The assistant needs the backend to be enabled.');
  }

  let token;
  try {
    token = await getIdToken();
  } catch {
    token = null;
  }
  if (!token) {
    return reply('Please sign in again to use the assistant.');
  }

  try {
    let res;
    if (file) {
      // Multipart: message + attachment. Browser sets the multipart boundary.
      const fd = new FormData();
      fd.append('message', message);
      if (conversationId != null) fd.append('conversationId', String(conversationId));
      fd.append('attachment', file);
      res = await authedUpload('/ai/chat', token, fd);
    } else {
      const body = { message };
      if (conversationId != null) body.conversationId = conversationId;
      res = await authedRequest('/ai/chat', token, { method: 'POST', body });
    }
    return reply(res.answer || "I couldn't find an answer to that.", {
      sources: Array.isArray(res.sources) ? res.sources : [],
      conversationId: res.conversationId != null ? res.conversationId : conversationId || null,
      toolsUsed: res.toolsUsed || [],
      degraded: Boolean(res.degraded),
    });
  } catch (e) {
    // Friendly, non-leaky error messages by status.
    const status = e && e.status;
    if (status === 503) {
      return reply('The AI Assistant is not available right now. Please try again later.');
    }
    if (status === 504) {
      return reply('The assistant took too long to respond. Please try again.');
    }
    if (status === 401) {
      return reply('Your session expired. Please sign in again.');
    }
    if (status === 413) {
      return reply('That message or file is too large. Please shorten it or attach a smaller file (max 25 MB).');
    }
    if (status === 415) {
      return reply('That file type is not supported. Attach an image, PDF, DOCX or TXT file.');
    }
    return reply('Something went wrong answering that. Please try again.');
  }
}
