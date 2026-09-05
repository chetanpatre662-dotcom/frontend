/**
 * aiService.js — Universal AI Assistant service (FRONTEND, rule-based).
 * -----------------------------------------------------------------------------
 * IMPORTANT: There is NO real LLM behind this yet. This module is a local,
 * rule-based responder that recognizes a few intents and answers them using the
 * app's REAL read services (classes, announcements, question papers) — scoped
 * server-side by the authenticated identity. It never invents data it can't
 * source from a real API, and it clearly says when an action isn't wired yet.
 *
 * FUTURE (Phase 2): ask() -> POST /api/ai -> LLM + server-side allowed tools
 * (each re-checking Firebase UID + role + class membership) -> PostgreSQL.
 * -----------------------------------------------------------------------------
 */
import { getFacultyClasses, getStudentClasses } from './classApiService.js';
import { getAnnouncements, getForStudent } from './announcementService.js';
import { getFacultyPapers, getStudentPapers } from './questionPaperService.js';

/** Role-specific suggested prompts shown in the empty state. */
export function suggestedPrompts(role) {
  if (role === 'faculty') {
    return [
      'Show my active classes',
      'Show my recent announcements',
      'Show my question papers',
      'What can you help me with?',
    ];
  }
  if (role === 'admin') {
    return [
      'Show recent announcements',
      'What can you do?',
    ];
  }
  return [
    'Show my current semester classes',
    'What announcements are relevant to me?',
    'Show my question papers',
    'What can you help me with?',
  ];
}

function detectIntent(text) {
  const t = (text || '').toLowerCase();
  const has = (...words) => words.some((w) => t.includes(w));
  if (has('announce', 'notice')) return 'announcements';
  if (has('question paper', 'previous paper', 'past paper', 'qp', 'paper')) return 'papers';
  if (has('class', 'subject', 'course', 'semester')) return 'classes';
  if (has('help', 'what can you', 'who are you', 'capab')) return 'help';
  return 'unknown';
}

function reply(text, data = null) {
  return { role: 'assistant', text, data, at: new Date().toISOString() };
}
function bullets(items) { return items.map((i) => `- ${i}`).join('\n'); }

/**
 * Ask the assistant. Answers only from REAL data the current user can access.
 * @param {object} p { role, text }
 */
export async function ask({ role, text }) {
  const intent = detectIntent(text || '');

  try {
    if (intent === 'help') return reply(helpText(role));

    if (intent === 'classes') {
      const res = role === 'student' ? await getStudentClasses() : await getFacultyClasses();
      if (!res.ok) return reply('I could not load your classes right now. Please try again.');
      const classes = (res.classes || []).filter((c) => c.status !== 'archived');
      if (!classes.length) return reply('You have no active classes yet.');
      return reply(
        `${role === 'student' ? 'Your' : 'Your'} active classes (${classes.length}):\n` +
        bullets(classes.map((c) => `${c.subject || c.title} — ${c.course} ${c.branch} · Sem ${c.semester}`)),
        { type: 'classes', items: classes }
      );
    }

    if (intent === 'announcements') {
      const res = role === 'student' ? await getForStudent() : await getAnnouncements();
      if (!res.ok) return reply('I could not load announcements right now. Please try again.');
      const published = (res.items || []).filter((a) => a.status !== 'draft');
      if (!published.length) return reply('There are no announcements relevant to you right now.');
      return reply(
        `${published.length} relevant announcement${published.length > 1 ? 's' : ''}:\n` +
        bullets(published.slice(0, 6).map((a) => `${a.title}${a.type ? ` (${a.type})` : ''}`)),
        { type: 'announcements', items: published }
      );
    }

    if (intent === 'papers') {
      const res = role === 'student' ? await getStudentPapers() : await getFacultyPapers();
      if (!res.ok) return reply('I could not load question papers right now. Please try again.');
      const papers = res.items || [];
      if (!papers.length) return reply('No question papers are available to you yet.');
      return reply(
        `Found ${papers.length} question paper${papers.length > 1 ? 's' : ''}:\n` +
        bullets(papers.slice(0, 6).map((p) => `${p.subject || p.title}${p.year ? ` (${p.year})` : ''}`)),
        { type: 'papers', items: papers }
      );
    }

    return reply(
      "I can't do that yet in this preview. Right now I can look up your classes, announcements and question papers. Action commands (creating classes, sending messages) will be enabled once the AI backend is connected."
    );
  } catch (e) {
    console.debug('[ai] error', e);
    return reply('Something went wrong while looking that up. Please try again.');
  }
}

function helpText(role) {
  const common = "I'm your College Management assistant. I answer using only the data you're allowed to see.";
  if (role === 'faculty') {
    return `${common}\n\nTry:\n- "Show my active classes"\n- "Show my recent announcements"\n- "Show my question papers"`;
  }
  if (role === 'admin') {
    return `${common}\n\nTry:\n- "Show recent announcements"`;
  }
  return `${common}\n\nTry:\n- "Show my current semester classes"\n- "What announcements are relevant to me?"\n- "Show my question papers"`;
}
