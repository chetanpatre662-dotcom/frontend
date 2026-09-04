/**
 * aiService.js — Universal AI Assistant service (FRONTEND MOCK).
 * -----------------------------------------------------------------------------
 * IMPORTANT: There is NO real LLM behind this yet. This module is a local,
 * rule-based mock that recognizes a few intents and answers them using the
 * app's EXISTING read services (classes, notes, messages, announcements,
 * question papers, students, faculty). It exists to build and prove the AI
 * chat UI + interaction architecture. It never invents data it can't source
 * from a service, and it clearly tells the user when something isn't wired yet.
 *
 * FUTURE ARCHITECTURE (Phase 2) — the UI/service boundary is designed for this:
 *
 *   AI Chat (UI)
 *     -> aiService.ask({ role, profile, text })      // this file
 *     -> POST /api/ai  (Node.js + Express orchestrator)
 *     -> LLM provider (intent + tool selection)
 *     -> Allowed TOOL layer (server-side), each doing an authorization check:
 *          getStudentClasses / getClassNotes / getFacultyMessages /
 *          getAnnouncements / getQuestionPapers / getStudents /
 *          getFacultyClasses / createClass / sendClassMessage / uploadNote
 *     -> PostgreSQL / Firebase Storage
 *     -> safe result -> LLM -> response
 *
 * SECURITY: The AI must NEVER get arbitrary DB/SQL access. Every action runs
 * through an allowed tool that re-checks the authenticated Firebase UID, the
 * user's role, class membership and ownership on the SERVER. This frontend mock
 * only reads data the current mock user could already see in the UI.
 * -----------------------------------------------------------------------------
 */
import { latency } from './apiClient.js';
import { getClasses } from './classService.js';
import { getClassesForStudent } from './studentClassService.js';
import { getNotes } from './notesService.js';
import { getMessages } from './messageService.js';
import { getAnnouncements, getForStudent } from './announcementService.js';
import { getPapers } from './questionPaperService.js';
import { getStudents } from './studentService.js';
import { getFaculty } from './facultyService.js';
import { DEMO_CONTENT } from '../config.js';

/**
 * Role-specific suggested prompts shown in the empty state.
 */
export function suggestedPrompts(role) {
  if (role === 'faculty') {
    return [
      'Show my active classes',
      'Show my recent announcements',
      'How many students do my classes reach?',
      'What can you help me with?',
    ];
  }
  if (role === 'admin') {
    return [
      'Show all active classes',
      'How many students and faculty are there?',
      'Show recent announcements',
      'What can you do?',
    ];
  }
  // student
  return [
    'Show my current semester classes',
    'Find my latest class notes',
    'What did my faculty send recently?',
    'What announcements are relevant to me?',
  ];
}

/* ------------------------------------------------------------------ *
 * Intent recognition (mock). A real LLM replaces this on the server.  *
 * ------------------------------------------------------------------ */
function detectIntent(text) {
  const t = text.toLowerCase();
  const has = (...words) => words.some((w) => t.includes(w));

  if (has('message', 'sent', 'send', 'posted', 'faculty said')) return 'messages';
  if (has('note', 'material', 'slides')) return 'notes';
  if (has('announce', 'notice')) return 'announcements';
  if (has('question paper', 'previous paper', 'past paper', 'qp')) return 'papers';
  if (has('class', 'subject', 'course', 'semester')) return 'classes';
  if (has('student') && !has('my')) return 'students';
  if (has('faculty', 'teacher', 'professor')) return 'faculty';
  if (has('help', 'what can you', 'who are you', 'capab')) return 'help';
  return 'unknown';
}

/** Small helpers to shape a consistent assistant reply. */
function reply(text, data = null) {
  return { role: 'assistant', text, data, at: new Date().toISOString() };
}
function bullets(items) {
  return items.map((i) => `- ${i}`).join('\n');
}

/**
 * Ask the assistant. Role + academic profile scope what it can see.
 * @param {object} p
 * @param {'student'|'faculty'|'admin'} p.role
 * @param {object} p.profile student academic profile / faculty id context
 * @param {string} p.text user message
 * @returns {Promise<{role:'assistant', text:string, data?:any, at:string}>}
 */
export async function ask({ role, profile = {}, text }) {
  await latency(600); // simulate model "thinking" so the typing state is visible
  const intent = detectIntent(text || '');

  try {
    if (intent === 'help') return reply(helpText(role));

    if (intent === 'classes') {
      if (role === 'student') {
        const classes = await getClassesForStudent(profile);
        if (!classes.length) return reply('You have no active classes for your current program, branch and semester yet.');
        return reply(
          `You are enrolled in ${classes.length} class${classes.length > 1 ? 'es' : ''} this semester (${profile.program || profile.course} · ${profile.branch} · Semester ${profile.semester}):\n` +
          bullets(classes.map((c) => `${c.courseName} — ${c.facultyName}`)),
          { type: 'classes', items: classes }
        );
      }
      const facultyId = profile.facultyId || DEMO_CONTENT.FACULTY_OWNER_ID;
      const classes = role === 'faculty' ? await getClasses({ facultyId }) : await getClasses();
      const active = classes.filter((c) => c.status === 'active');
      if (!active.length) return reply('There are no active classes yet.');
      return reply(
        `${role === 'faculty' ? 'Your' : 'All'} active classes (${active.length}):\n` +
        bullets(active.map((c) => `${c.courseName} — ${c.program} ${c.branch} · Sem ${c.semester}`)),
        { type: 'classes', items: active }
      );
    }

    if (intent === 'messages') {
      if (role === 'student') {
        const classes = await getClassesForStudent(profile);
        const out = [];
        for (const c of classes) {
          const msgs = await getMessages({ classId: c.id });
          msgs.slice(-2).forEach((m) => out.push({ t: m.created, line: `${c.courseName}: "${m.body}"` }));
        }
        out.sort((a, b) => new Date(b.t) - new Date(a.t));
        if (!out.length) return reply('Your faculty haven\'t posted any class messages yet.');
        return reply(`Recent messages from your classes:\n${bullets(out.slice(0, 6).map((o) => o.line))}`);
      }
      return reply('Open a class and use the Messages tab to view or post messages. Sending messages by chat will be enabled once the AI backend is connected.');
    }

    if (intent === 'notes') {
      if (role === 'student') {
        const classes = await getClassesForStudent(profile);
        const notesByClass = [];
        for (const c of classes) {
          const notes = await getNotes({ classId: c.id });
          notes.forEach((n) => notesByClass.push(`${c.courseName}: ${n.title}`));
        }
        if (!notesByClass.length) return reply('No notes have been uploaded to your classes yet.');
        return reply(`Here are the latest notes from your classes:\n${bullets(notesByClass.slice(0, 10))}`);
      }
      return reply('Open a class and go to the Notes tab to view or upload notes. I can list class notes for students automatically once the backend AI tools are connected.');
    }

    if (intent === 'announcements') {
      const list = role === 'student' ? await getForStudent(profile) : await getAnnouncements();
      const published = list.filter((a) => a.status !== 'draft');
      if (!published.length) return reply('There are no announcements relevant to you right now.');
      return reply(
        `${published.length} relevant announcement${published.length > 1 ? 's' : ''}:\n` +
        bullets(published.slice(0, 6).map((a) => `${a.title} (${a.type})`)),
        { type: 'announcements', items: published }
      );
    }

    if (intent === 'papers') {
      const papers = await getPapers();
      if (!papers.length) return reply('No previous question papers are available yet.');
      return reply(
        `Found ${papers.length} question paper${papers.length > 1 ? 's' : ''}:\n` +
        bullets(papers.slice(0, 6).map((p) => `${p.subject} (${p.year}) — ${p.branch} Sem ${p.semester}`)),
        { type: 'papers', items: papers }
      );
    }

    if (intent === 'students' && (role === 'admin' || role === 'faculty')) {
      const students = await getStudents();
      return reply(`There are ${students.length} students in the system. Use the Students page for full filtering and details.`);
    }

    if (intent === 'faculty' && role === 'admin') {
      const faculty = await getFaculty();
      return reply(`There are ${faculty.length} faculty members. Use the Faculty page to manage accounts.`);
    }

    // Unknown / not-yet-wired action.
    return reply(
      "I can't do that yet in this preview. Right now I can look up classes, notes, announcements and question papers you have access to. Action commands (like creating classes or sending messages) will be enabled once the AI backend is connected."
    );
  } catch (e) {
    console.debug('[ai] error', e);
    return reply('Something went wrong while looking that up. Please try again.');
  }
}

function helpText(role) {
  const common = 'I\'m your College Management assistant. I answer using only the data you\'re allowed to see.';
  if (role === 'faculty') {
    return `${common}\n\nTry:\n- "Show my active classes"\n- "Show my recent announcements"\n\nComing soon: creating classes, sending class messages and uploading notes by chat.`;
  }
  if (role === 'admin') {
    return `${common}\n\nTry:\n- "Show all active classes"\n- "How many students and faculty are there?"\n- "Show recent announcements"`;
  }
  return `${common}\n\nTry:\n- "Show my current semester classes"\n- "Find my latest class notes"\n- "What announcements are relevant to me?"`;
}
