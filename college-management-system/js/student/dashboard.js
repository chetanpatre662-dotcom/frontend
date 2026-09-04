/**
 * student/dashboard.js — Student overview built around real activity:
 * greeting + academic context, My Classes (auto-matched), recent faculty
 * messages, recent notes, and relevant announcements. No filler statistics.
 */
import { ROUTES, resolvePath, DEMO_CONTENT } from '../config.js';
import { esc, timeAgo, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { typeBadge, emptyState, loadingState } from '../common/components.js';
import { bootstrapStudent } from './nav.js';
import { getForStudent } from '../services/announcementService.js';
import { getClassesForStudent } from '../services/studentClassService.js';
import { getMessages } from '../services/messageService.js';
import { getNotes } from '../services/notesService.js';

bootstrapStudent({ activeId: 'dashboard', title: 'Dashboard' }).then((ctx) => { if (ctx) init(ctx); });

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function init({ main, user: identity }) {
  // Firebase identity (name/email) merged with the demo academic profile.
  const user = { ...DEMO_CONTENT.STUDENT_PROFILE, ...identity };
  const program = user.program || user.course;
  const firstName = (user.name || 'there').split(' ')[0];

  main.innerHTML = `
    <div class="greeting">
      <div>
        <h1 class="g-title">${esc(greetingWord())}, ${esc(firstName)}</h1>
        <div class="g-sub">
          <span class="g-context">${icon('graduation')} ${esc(program)} • ${esc(user.branch)} • Semester ${esc(user.semester)}</span>
        </div>
      </div>
      <div class="g-actions">
        <a class="btn btn-primary" href="${resolvePath(ROUTES.STUDENT.AI)}">${icon('sparkles')} Ask the assistant</a>
      </div>
    </div>

    <div id="dashBody">${loadingState('Loading your dashboard…')}</div>
  `;

  const profile = { program, course: program, branch: user.branch, semester: user.semester };
  const classes = await getClassesForStudent(profile);

  // Aggregate recent messages + notes across the student's classes.
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const [msgLists, noteLists, anns] = await Promise.all([
    Promise.all(classes.map((c) => getMessages({ classId: c.id }))),
    Promise.all(classes.map((c) => getNotes({ classId: c.id }))),
    getForStudent(profile),
  ]);
  const messages = msgLists.flat().sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 4);
  const notes = noteLists.flat().sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 4);

  // Enrich each class with unread-message + note counts for the compact cards.
  classes.forEach((c, i) => {
    c.unread = msgLists[i].filter((m) => m.unread).length;
    c.noteCount = noteLists[i].length;
  });

  const classDetail = resolvePath(ROUTES.STUDENT.CLASS_DETAIL);

  document.getElementById('dashBody').innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>My Classes</h2>
        <a class="btn btn-sm" href="${resolvePath(ROUTES.STUDENT.CLASSES)}">View all</a>
      </div>
      ${classes.length
        ? `<div class="class-grid">${classes.slice(0, 3).map((c) => classCard(c, classDetail)).join('')}</div>`
        : emptyState({ iconName: 'classes', title: 'No classes yet', message: 'Classes for your program, branch and semester will appear here automatically.' })}
    </section>

    <div class="dash-cols mt-6">
      <section class="section">
        <div class="section-head"><h2>Recent messages</h2></div>
        <div class="card"><div class="card-body">
          ${messages.length
            ? `<div class="list-flush">${messages.map((m) => messageRow(m, classById, classDetail)).join('')}</div>`
            : emptyRow('No messages yet', 'Your faculty haven\'t posted any class messages.')}
        </div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Recent notes</h2></div>
        <div class="card"><div class="card-body">
          ${notes.length
            ? `<div class="list-flush">${notes.map((n) => noteRow(n, classById, classDetail)).join('')}</div>`
            : emptyRow('No notes yet', 'No study material has been shared yet.')}
        </div></div>
      </section>
    </div>

    <section class="section mt-6">
      <div class="section-head">
        <h2>Announcements</h2>
        <a class="btn btn-sm" href="${resolvePath(ROUTES.STUDENT.ANNOUNCEMENTS)}">View all</a>
      </div>
      <div class="card"><div class="card-body">
        ${anns.length
          ? `<div class="list-flush">${anns.slice(0, 4).map(annRow).join('')}</div>`
          : emptyRow('No announcements', 'Nothing relevant to you right now.')}
      </div></div>
    </section>
  `;
}

function classCard(c, detailUrl) {
  const facts = [];
  if (c.unread) facts.push(`${c.unread} new message${c.unread > 1 ? 's' : ''}`);
  if (c.noteCount) facts.push(`${c.noteCount} note${c.noteCount > 1 ? 's' : ''}`);
  const subject = c.courseName || c.course;
  return `
    <a class="klass-card compact" href="${detailUrl}?id=${encodeURIComponent(c.id)}">
      <div class="kc-top">
        <span class="kc-avatar" style="background:${avatarColor(subject)}">${esc(initials(subject))}</span>
        <div class="kc-head">
          <div class="kc-title" title="${esc(subject)}">${esc(subject)}</div>
          <div class="kc-sub">${esc(c.program || c.course)} • ${esc(c.branch)} • Sem ${c.semester}</div>
        </div>
        <span class="kc-open">${icon('arrowRight')}</span>
      </div>
      <div class="kc-meta">
        <span class="kc-fact">${esc(c.facultyName || 'Faculty')}</span>
        ${facts.length ? `<span class="kc-fact alert">${esc(facts.join(' · '))}</span>` : ''}
      </div>
    </a>`;
}

function messageRow(m, classById, detailUrl) {
  const cls = classById[m.classId];
  return `
    <a class="list-link" href="${detailUrl}?id=${encodeURIComponent(m.classId)}">
      <span class="avatar" style="width:32px;height:32px;font-size:var(--fs-xs)">${esc(initials(m.facultyName))}</span>
      <div class="lr-main">
        <div class="lr-title">${esc(cls ? cls.courseName : 'Class')}</div>
        <div class="lr-meta">${esc(m.body)}</div>
      </div>
      <span class="lr-meta">${esc(timeAgo(m.created))}</span>
    </a>`;
}

function noteRow(n, classById, detailUrl) {
  const cls = classById[n.classId];
  return `
    <a class="list-link" href="${detailUrl}?id=${encodeURIComponent(n.classId)}">
      <span class="lr-icon">${icon('file')}</span>
      <div class="lr-main">
        <div class="lr-title">${esc(n.title)}</div>
        <div class="lr-meta">${esc(cls ? cls.courseName : 'Class')}</div>
      </div>
      <span class="ll-chev">${icon('chevronRight')}</span>
    </a>`;
}

function annRow(a) {
  return `
    <div class="list-row">
      <span class="lr-icon">${icon('megaphone')}</span>
      <div class="lr-main"><div class="lr-title">${esc(a.title)}</div>
        <div class="lr-meta">${esc(timeAgo(a.created))}</div></div>
      <div class="lr-right">${typeBadge(a.type)}</div>
    </div>`;
}

function emptyRow(title, message) {
  return `<div class="text-muted" style="padding:var(--sp-2) 0"><strong style="display:block;color:var(--gray-700)">${esc(title)}</strong>${esc(message)}</div>`;
}
