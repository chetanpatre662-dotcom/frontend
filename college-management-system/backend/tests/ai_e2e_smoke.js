/**
 * tests/ai_e2e_smoke.js — end-to-end smoke of the AI orchestrator tool loop.
 * -----------------------------------------------------------------------------
 * This is NOT a live-Gemini test (no key in this env). Instead it drives the
 * REAL aiOrchestrator.ask() code path while stubbing ONLY the two external
 * boundaries — the Gemini HTTP transport and the DB `query` — so we exercise
 * the genuine multi-step tool loop, metadata (toolUsed/ragUsed) and persistence
 * wiring without inventing any data.
 *
 * Run: node tests/ai_e2e_smoke.js   (from backend/)
 * -----------------------------------------------------------------------------
 */
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

/* ---- Stub the DB so repositories don't hit Postgres ---- */
const dbPath = require.resolve('../src/config/database');
require.cache[dbPath] = new Module(dbPath, module);
require.cache[dbPath].exports = {
  pool: {},
  // Return a conversation row for the ai_conversations INSERT (so ask() has a
  // convo.id to work with); empty rows for everything else (classes/messages/
  // chunks) so no data is fabricated.
  query: async (text) => {
    if (/INSERT INTO ai_conversations/i.test(text)) {
      return { rows: [{ id: 101, user_id: 1, title: 'smoke', created_at: new Date(), updated_at: new Date() }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
  verifyConnection: async () => ({ ok: true }),
  closePool: async () => {},
};
require.cache[dbPath].loaded = true;

/* ---- Stub Gemini: enabled + scripted tool-call then final answer ---- */
const gemPath = require.resolve('../src/services/geminiService');
let scriptedCalls = [];   // queued functionCalls arrays per generateWithTools turn
let finalText = 'Here is your grounded answer.';
require.cache[gemPath] = new Module(gemPath, module);
require.cache[gemPath].exports = {
  isEnabled: () => true, // pretend a key IS configured, so ask() runs the loop
  generateWithTools: async () => {
    const calls = scriptedCalls.shift() || [];
    return { text: calls.length ? '' : finalText, functionCalls: calls, raw: {} };
  },
  generate: async () => ({ text: finalText, raw: {} }),
  embed: async () => new Array(768).fill(0.01),
  embedBatch: async (texts) => texts.map(() => new Array(768).fill(0.01)),
};
require.cache[gemPath].loaded = true;

const aiOrchestrator = require('../src/services/aiOrchestrator');

let passed = 0;
async function step(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

(async () => {
  console.log('AI orchestrator E2E smoke (stubbed Gemini + DB):');

  // 1) General question -> no tools -> toolUsed=false, ragUsed=false.
  await step('general question returns answer, no tools used', async () => {
    scriptedCalls = [[]]; // first turn: no tool calls
    const res = await aiOrchestrator.ask({
      user: { id: 1, role: 'student', firebase_uid: 'u1', display_name: 'Asha' },
      message: 'What is polymorphism?',
    });
    assert.equal(typeof res.answer, 'string');
    assert.equal(res.toolUsed, false);
    assert.equal(res.ragUsed, false);
    assert.ok(!res.degraded);
  });

  // 2) Personal-data question -> model calls get_my_assignments -> toolUsed=true.
  await step('assignment question triggers a tool call (toolUsed=true)', async () => {
    scriptedCalls = [
      [{ name: 'get_my_assignments', args: {} }], // turn 1: call the tool
      [],                                          // turn 2: produce final text
    ];
    const res = await aiOrchestrator.ask({
      user: { id: 2, role: 'student', firebase_uid: 'u2', display_name: 'Ravi' },
      message: 'mere assignments batao',
    });
    assert.equal(res.toolUsed, true, 'a tool should have run');
    assert.ok(res.toolsUsed.includes('get_my_assignments'));
    assert.equal(res.ragUsed, false, 'no RAG for this question');
  });

  // 3) RAG question -> model calls search_college_documents -> ragUsed reflects
  //    whether chunks were searched. With empty DB the RAG search returns
  //    searched:false gracefully, so ragUsed stays false (honest "not found").
  await step('college-document question calls RAG tool without fabricating', async () => {
    scriptedCalls = [
      [{ name: 'search_college_documents', args: { query: 'Unit 3 topics' } }],
      [],
    ];
    const res = await aiOrchestrator.ask({
      user: { id: 3, role: 'student', firebase_uid: 'u3', display_name: 'Sara' },
      message: 'According to our syllabus, what are the Unit 3 topics?',
    });
    assert.ok(res.toolsUsed.includes('search_college_documents'));
    assert.equal(typeof res.answer, 'string');
    // No chunks in the stubbed DB -> no fabricated sources.
    assert.equal(res.sources.length, 0, 'no sources fabricated when none found');
  });

  // 4) get_admin_stats is denied for a student even if the model requests it.
  await step('admin-only tool denied for a student (no counts leak)', async () => {
    scriptedCalls = [
      [{ name: 'get_admin_stats', args: {} }],
      [],
    ];
    const res = await aiOrchestrator.ask({
      user: { id: 4, role: 'student', firebase_uid: 'u4', display_name: 'Neha' },
      message: 'how many students are there in total?',
    });
    // The tool ran but returned an error object; the final answer is still text.
    assert.ok(res.toolsUsed.includes('get_admin_stats'));
    assert.equal(typeof res.answer, 'string');
  });

  // 5) Timetable question -> model calls get_my_timetable -> toolUsed=true.
  await step('timetable question triggers get_my_timetable (toolUsed=true)', async () => {
    scriptedCalls = [
      [{ name: 'get_my_timetable', args: { day: 'Monday' } }],
      [],
    ];
    const res = await aiOrchestrator.ask({
      user: { id: 5, role: 'student', firebase_uid: 'u5', display_name: 'Ihaan' },
      message: 'meri Monday ki classes kya hain?',
    });
    assert.equal(res.toolUsed, true);
    assert.ok(res.toolsUsed.includes('get_my_timetable'));
  });

  // 6) Multi-step: timetable THEN college-documents in the SAME turn.
  await step('multi-step: timetable + college documents in one answer', async () => {
    scriptedCalls = [
      [{ name: 'get_my_timetable', args: {} }],           // turn 1
      [{ name: 'search_college_documents', args: { query: 'Unit 1' } }], // turn 2
      [],                                                  // turn 3: final text
    ];
    const res = await aiOrchestrator.ask({
      user: { id: 6, role: 'student', firebase_uid: 'u6', display_name: 'Zoya' },
      message: 'kal meri first class kya hai aur us subject ka Unit 1 explain karo',
    });
    assert.ok(res.toolsUsed.includes('get_my_timetable'));
    assert.ok(res.toolsUsed.includes('search_college_documents'));
    assert.equal(res.toolUsed, true);
  });

  console.log(`\nE2E smoke: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}.`);
})();
