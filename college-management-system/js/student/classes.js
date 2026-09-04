/**
 * student/classes.js — "My Classes": the student's CURRENT-SEMESTER classes.
 *
 * Membership is AUTOMATIC: classes are matched to the student's structured
 * academic profile (program + branch + semester) via studentClassService.
 * There is no manual "join" — see studentClassService for the rule.
 */
import { ROUTES, resolvePath, DEMO_CONTENT } from '../config.js';
import { $, $$, esc, debounce, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { emptyState, skeletonCards } from '../common/components.js';
import { bootstrapStudent } from './nav.js';
import { getClassesForStudent } from '../services/studentClassService.js';
import { countUnread } from '../services/messageService.js';
import { getNotes } from '../services/notesService.js';

bootstrapStudent({ activeId: 'classes', title: 'My Classes' }).then((ctx) => { if (ctx) init(ctx); });

let all = [];

async function init({ main, user: identity }) {
  const user = { ...DEMO_CONTENT.STUDENT_PROFILE, ...identity };
  const program = user.program || user.course;

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">My Classes</h1>
        <p class="page-subtitle">Your current academic session. Classes are assigned automatically based on your program, branch and semester.</p>
      </div>
    </div>

    <div class="session-strip">
      ${icon('graduation')}
      <span>Current Academic Session</span>
      <span class="ss-badge">${esc(program)} • ${esc(user.branch)} • Semester ${esc(user.semester)}</span>
    </div>

    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search classes or faculty…" />
      </div>
    </div></div>

    <div id="grid">${skeletonCards(3)}</div>
  `;

  $('#searchInput').addEventListener('input', debounce(render, 200));

  const profile = { program, course: program, branch: user.branch, semester: user.semester };
  const classes = await getClassesForStudent(profile);

  // Enrich each class with unread messages + notes counts (derived).
  all = await Promise.all(classes.map(async (c) => ({
    ...c,
    unread: await countUnread({ classId: c.id }),
    noteCount: (await getNotes({ classId: c.id })).length,
  })));

  render();
}

function render() {
  const q = ($('#searchInput')?.value || '').trim().toLowerCase();
  const filtered = all.filter((c) =>
    !q || `${c.courseName} ${c.facultyName}`.toLowerCase().includes(q)
  );

  const host = $('#grid');
  if (!filtered.length) {
    host.innerHTML = emptyState({
      iconName: 'classes',
      title: all.length ? 'No matching classes' : 'No classes yet',
      message: all.length
        ? 'Try a different search.'
        : 'Once faculty create classes for your program, branch and semester, they will appear here automatically.',
    });
    return;
  }

  const detailUrl = resolvePath(ROUTES.STUDENT.CLASS_DETAIL);
  host.innerHTML = `<div class="class-grid">${filtered.map((c) => cardHTML(c, detailUrl)).join('')}</div>`;
}

function cardHTML(c, detailUrl) {
  const subject = c.courseName || c.course;
  const facts = [];
  if (c.unread) facts.push(`<span class="kc-fact alert">${icon('message')} ${c.unread} new message${c.unread > 1 ? 's' : ''}</span>`);
  if (c.noteCount) facts.push(`<span class="kc-fact">${icon('file')} ${c.noteCount} note${c.noteCount > 1 ? 's' : ''}</span>`);

  return `
    <a class="klass-card" href="${detailUrl}?id=${encodeURIComponent(c.id)}">
      <div class="kc-top">
        <span class="kc-avatar" style="background:${avatarColor(subject)}">${esc(initials(subject))}</span>
        <div class="kc-head">
          <div class="kc-title" title="${esc(subject)}">${esc(subject)}</div>
          <div class="kc-sub">${esc(c.program || c.course)} • ${esc(c.branch)} • Sem ${c.semester}</div>
        </div>
        <span class="kc-status">Active</span>
      </div>
      ${facts.length ? `<div class="kc-meta">${facts.join('')}</div>` : ''}
      <div class="kc-foot">
        <span class="kc-activity">${esc(c.facultyName || 'Faculty')}</span>
        <span class="kc-open">Enter Class ${icon('arrowRight')}</span>
      </div>
    </a>`;
}
