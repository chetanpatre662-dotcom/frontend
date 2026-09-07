/**
 * tests/ai.test.js — AI Assistant Phase 2 tests (built-in `node --test`).
 * -----------------------------------------------------------------------------
 * No live Gemini / DB required. We stub the database `query` with a spy so the
 * permission-filtering SQL can be asserted, and rely on the fact that the Gemini
 * key is not configured locally to test graceful degradation.
 *
 * Run: node --test   (from backend/)
 * -----------------------------------------------------------------------------
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

/* ------------------------------------------------------------------ */
/* Stub config/database.query BEFORE any repo requires it, so repos    */
/* capture our spy. We record the last SQL + params per call.          */
/* ------------------------------------------------------------------ */
const dbPath = require.resolve('../src/config/database');
const calls = [];
let nextRows = [];
const stubDb = {
  pool: {},
  query: async (text, params) => {
    calls.push({ text, params });
    return { rows: nextRows, rowCount: nextRows.length };
  },
  verifyConnection: async () => ({ ok: true }),
  closePool: async () => {},
};
require.cache[dbPath] = new Module(dbPath, module);
require.cache[dbPath].exports = stubDb;
require.cache[dbPath].loaded = true;

const aiRepository = require('../src/repositories/aiRepository');
const aiToolRegistry = require('../src/services/aiToolRegistry');
const aiOrchestrator = require('../src/services/aiOrchestrator');
const geminiService = require('../src/services/geminiService');

function lastSql() { return calls[calls.length - 1].text; }
function lastParams() { return calls[calls.length - 1].params; }

/* ============================ RAG permission scope ======================= */

test('RAG scope: student query filters to public OR own academic group', async () => {
  nextRows = [];
  await aiRepository.searchChunks({
    embedding: [0.1, 0.2, 0.3],
    scope: { role: 'student', studentGroup: { program: 'B.Tech', branch: 'CSE', semester: 3 } },
    topK: 5,
  });
  const sql = lastSql();
  const params = lastParams();
  assert.match(sql, /access_scope = 'public'/, 'must allow public chunks');
  assert.match(sql, /access_scope = 'class'/, 'must gate class chunks');
  assert.match(sql, /program = \$/, 'must bind program');
  assert.match(sql, /branch = \$/, 'must bind branch');
  assert.match(sql, /semester = \$/, 'must bind semester');
  assert.ok(params.includes('B.Tech') && params.includes('CSE') && params.includes(3),
    'student group values must be bound as parameters');
});

test('RAG scope: faculty query filters to public OR owned classes', async () => {
  nextRows = [];
  await aiRepository.searchChunks({
    embedding: [0.1], scope: { role: 'faculty', classIds: [11, 22] }, topK: 5,
  });
  const sql = lastSql();
  assert.match(sql, /class_id = ANY/, 'faculty scope must restrict to owned class ids');
  assert.ok(lastParams().some((p) => Array.isArray(p) && p.includes(11)), 'class ids bound as array param');
});

test('RAG scope: admin sees all chunks (WHERE TRUE)', async () => {
  nextRows = [];
  await aiRepository.searchChunks({ embedding: [0.1], scope: { role: 'admin' }, topK: 5 });
  assert.match(lastSql(), /WHERE TRUE/, 'admin scope should not filter');
});

test('RAG scope: unknown/no role falls back to public-only', async () => {
  nextRows = [];
  await aiRepository.searchChunks({ embedding: [0.1], scope: { role: 'none' }, topK: 5 });
  const sql = lastSql();
  assert.match(sql, /access_scope = 'public'/);
  assert.doesNotMatch(sql, /WHERE TRUE/);
});

/* ==================== conversation ownership isolation =================== */

test('findConversationForUser binds BOTH id AND user_id (ownership)', async () => {
  nextRows = [];
  await aiRepository.findConversationForUser(50, 7);
  assert.match(lastSql(), /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(lastParams(), [50, 7]);
});

test('deleteConversation is scoped to the owner (id AND user_id)', async () => {
  nextRows = [];
  await aiRepository.deleteConversation(50, 7);
  assert.match(lastSql(), /DELETE FROM ai_conversations WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(lastParams(), [50, 7]);
});

test('renameConversation is scoped to the owner (id AND user_id)', async () => {
  nextRows = [];
  await aiRepository.renameConversation(50, 7, 'New title');
  assert.match(lastSql(), /WHERE id = \$1 AND user_id = \$2/);
  assert.equal(lastParams()[0], 50);
  assert.equal(lastParams()[1], 7);
});

test('orchestrator.getConversation returns null when not owned (no leak)', async () => {
  // findConversationForUser returns [] (row not owned) -> null, and we never
  // proceed to fetch messages.
  nextRows = [];
  const result = await aiOrchestrator.getConversation({ id: 999, role: 'student' }, 50);
  assert.equal(result, null);
});

/* ========================= tool authorization design ===================== */

test('no AI tool accepts a user/role/id parameter (no impersonation)', () => {
  const decls = aiToolRegistry.toolDeclarations()[0].functionDeclarations;
  const leaks = decls.filter((d) => {
    const props = (d.parameters && d.parameters.properties) || {};
    return Object.keys(props).some((k) => /^(user|userid|user_id|role|firebase|studentid|facultyid)/i.test(k));
  });
  assert.equal(leaks.length, 0, 'tools must derive identity server-side, never from args');
});

test('AI toolset is READ-ONLY (no create/update/delete/write tools)', () => {
  const names = aiToolRegistry.toolNames();
  const writeish = names.filter((n) => /create|update|delete|remove|add|edit|approve|reject|send|set|write|modify/i.test(n));
  assert.equal(writeish.length, 0, `no write/action tools allowed, found: ${writeish.join(', ')}`);
});

test('executeTool refuses when there is no authenticated user', async () => {
  const r = await aiToolRegistry.executeTool('get_my_classes', {}, {});
  assert.ok(r && r.error === 'Not authenticated.');
});

test('executeTool rejects an unknown tool name', async () => {
  const r = await aiToolRegistry.executeTool('run_sql', { user: { id: 1 } }, {});
  assert.match(r.error, /Unknown tool/);
});

test('there is no raw-SQL / execute-SQL tool exposed', () => {
  const names = aiToolRegistry.toolNames().join(',').toLowerCase();
  assert.doesNotMatch(names, /sql|query|exec|raw/);
});

/* ===================== graceful degradation (no key) ===================== */

test('Gemini is not configured in the test env', () => {
  assert.equal(geminiService.isEnabled(), false);
});

test('orchestrator.ask degrades gracefully with no Gemini key (no throw, no secret)', async () => {
  const res = await aiOrchestrator.ask({
    user: { id: 1, role: 'student', firebase_uid: 'x' },
    message: 'hello',
  });
  assert.equal(res.degraded, true);
  assert.equal(typeof res.answer, 'string');
  assert.doesNotMatch(JSON.stringify(res).toLowerCase(), /gemini_api_key|apikey|private_key/);
});

/* ===================== system prompt hardening =========================== */

test('system prompt enforces read-only, anti-hallucination and confidentiality', () => {
  const p = aiOrchestrator.buildSystemPrompt({ role: 'student', display_name: 'A' }, { name: 'A', group: 'B.Tech CSE, sem 3' });
  assert.match(p, /READ-ONLY/);
  assert.match(p, /NEVER invent/);
  assert.match(p, /Never reveal/i);
  assert.match(p, /STUDENT/);
  // No sensitive identifier VALUES leaked into the prompt (the words may appear
  // in the read-only rules, e.g. "changing roles/passwords" — that's fine).
  assert.doesNotMatch(p, /firebase_uid|GEMINI_API_KEY|private_key/i);
});

/* ================= new real-data tools (assignments/projects/admin) ====== */

test('new real-data tools are registered', () => {
  const names = aiToolRegistry.toolNames();
  assert.ok(names.includes('get_my_assignments'), 'get_my_assignments registered');
  assert.ok(names.includes('get_my_projects'), 'get_my_projects registered');
  assert.ok(names.includes('get_admin_stats'), 'get_admin_stats registered');
});

test('new tools expose NO user/role/id parameter (identity is server-side)', () => {
  const decls = aiToolRegistry.toolDeclarations()[0].functionDeclarations;
  const targets = ['get_my_assignments', 'get_my_projects', 'get_admin_stats'];
  for (const name of targets) {
    const d = decls.find((x) => x.name === name);
    assert.ok(d, `${name} has a declaration`);
    const props = (d.parameters && d.parameters.properties) || {};
    const leak = Object.keys(props).some((k) => /^(user|userid|user_id|role|firebase|studentid|facultyid|studentId|facultyId)/i.test(k));
    assert.equal(leak, false, `${name} must not accept an identity parameter`);
  }
});

test('get_admin_stats DENIES a student (role gate), never returns counts', async () => {
  const r = await aiToolRegistry.executeTool('get_admin_stats', { user: { id: 5, role: 'student', firebase_uid: 's' } }, {});
  assert.ok(r && typeof r.error === 'string', 'student must get an error, not stats');
  assert.match(r.error, /administrator/i);
  // Ensure no numeric count fields leaked to a non-admin.
  assert.equal(r.totalUsers, undefined);
  assert.equal(r.students, undefined);
});

test('get_admin_stats DENIES a faculty (role gate)', async () => {
  const r = await aiToolRegistry.executeTool('get_admin_stats', { user: { id: 6, role: 'faculty', firebase_uid: 'f' } }, {});
  assert.ok(r && typeof r.error === 'string');
  assert.equal(r.totalUsers, undefined);
});

/* ============ no fabrication: timetable / attendance / marks ============= */

test('NO attendance / marks tool exists (still no real backing data to fabricate)', () => {
  const names = aiToolRegistry.toolNames().join(',').toLowerCase();
  // Timetable IS now a real, data-backed feature (get_my_timetable) — allowed.
  // Attendance and marks remain unbacked, so no tool for them may exist.
  assert.doesNotMatch(names, /attendance/);
  assert.doesNotMatch(names, /\bmarks\b/);
  assert.doesNotMatch(names, /\bgrade\b/);
});

test('system prompt explicitly refuses to invent attendance/marks/timetable', () => {
  const p = aiOrchestrator.buildSystemPrompt({ role: 'student', display_name: 'A' }, { name: 'A', group: 'B.Tech CSE, sem 3' });
  // The anti-hallucination block names these exact fields + tells the model to
  // say they are not available in Askbook rather than inventing them.
  assert.match(p, /attendance/i);
  assert.match(p, /marks/i);
  assert.match(p, /timetable/i);
  assert.match(p, /not available in\s+Askbook/i);
});

/* ================= additive response metadata (ragUsed/toolUsed) ========= */

test('degraded orchestrator response carries additive toolUsed/ragUsed = false', async () => {
  const res = await aiOrchestrator.ask({
    user: { id: 1, role: 'student', firebase_uid: 'x' },
    message: 'what is my attendance?',
  });
  // With no Gemini key we degrade; the additive flags must be present + false.
  assert.equal(res.degraded, true);
  assert.equal(res.toolUsed, false, 'toolUsed present + false on degraded path');
  assert.equal(res.ragUsed, false, 'ragUsed present + false on degraded path');
});

/* ============================ timetable tool ============================= */

test('get_my_timetable is registered and read-only (no write verb)', () => {
  const names = aiToolRegistry.toolNames();
  assert.ok(names.includes('get_my_timetable'), 'get_my_timetable registered');
  // Re-assert the whole toolset stays read-only after the addition.
  const writeish = names.filter((n) => /create|update|delete|remove|add|edit|approve|reject|send|set|write|modify/i.test(n));
  assert.equal(writeish.length, 0, `no write tools allowed, found: ${writeish.join(', ')}`);
});

test('get_my_timetable exposes NO identity parameter (server-side identity only)', () => {
  const decls = aiToolRegistry.toolDeclarations()[0].functionDeclarations;
  const d = decls.find((x) => x.name === 'get_my_timetable');
  assert.ok(d, 'get_my_timetable has a declaration');
  const props = (d.parameters && d.parameters.properties) || {};
  const leak = Object.keys(props).some((k) => /^(user|userid|user_id|role|firebase|studentid|facultyid)/i.test(k));
  assert.equal(leak, false, 'get_my_timetable must not accept an identity parameter');
  // The only argument it accepts is an optional day filter.
  assert.deepEqual(Object.keys(props).sort(), ['day']);
});

test('get_my_timetable refuses when there is no authenticated user', async () => {
  const r = await aiToolRegistry.executeTool('get_my_timetable', {}, {});
  assert.ok(r && r.error === 'Not authenticated.');
});

/* =============== multimodal ingest: source-tracking + honesty ============ */

test('multimodalIngestService.ingestText skips (no fabrication) when AI is off', async () => {
  const multimodal = require('../src/services/multimodalIngestService');
  // Gemini is not configured in tests -> must skip, never write fake chunks.
  const r = await multimodal.ingestText({
    sourceType: 'document', sourceId: 1, text: 'hello world', scope: { accessScope: 'public' },
  });
  assert.equal(r.status, 'skipped');
  assert.match(r.reason, /not configured/i);
});

test('timetable is an allowed RAG source_type in the ingest layer', () => {
  // ingestTimetable stamps source_type='timetable'; assert the helper exists and
  // is wired (behavioral guard against accidental removal).
  const multimodal = require('../src/services/multimodalIngestService');
  assert.equal(typeof multimodal.ingestTimetable, 'function');
  assert.equal(typeof multimodal.bufferToText, 'function');
  assert.equal(typeof multimodal.urlToText, 'function');
});
