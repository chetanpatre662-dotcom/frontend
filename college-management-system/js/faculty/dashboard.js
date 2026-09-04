/**
 * faculty/dashboard.js — Faculty workspace: greeting, quick actions,
 * My Classes, and recent activity. Metrics are backed by real content counts.
 */
import { ROUTES, resolvePath, DEMO_CONTENT } from '../config.js';
import { esc, timeAgo, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { typeBadge, loadingState, emptyState } from '../common/components.js';
import { bootstrapFaculty } from './nav.js';
import { getClasses } from '../services/classService.js';
import { getAnnouncements } from '../services/announcementService.js';
import { getPapers } from '../services/questionPaperService.js';

bootstrapFaculty({ activeId: 'dashboard', title: 'Dashboard' }).then((ctx) => { if (ctx) init(ctx); });

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function init({ main, user }) {
  const facultyId = DEMO_CONTENT.FACULTY_OWNER_ID;
  const firstName = (user.name || 'there').split(' ')[0];

  main.innerHTML = `
    <div class="greeting">
      <div>
        <h1 class="g-title">${esc(greetingWord())}, ${esc(firstName)}</h1>
        <div class="g-sub">${esc(user.designation || 'Faculty')}${user.department ? ' · ' + esc(user.department) : ''}</div>
      </div>
      <div class="g-actions">
        <a class="btn btn-primary" href="${resolvePath(ROUTES.FACULTY.CLASSES)}">${icon('plus')} Create class</a>
      </div>
    </div>

    <div id="dashBody">${loadingState('Loading your workspace…')}</div>
  `;

  const [classes, announcements, papers] = await Promise.all([
    getClasses({ facultyId }),
    getAnnouncements({ facultyId }),
    getPapers({ facultyId }),
  ]);

  const active = classes.filter((c) => c.status === 'active');
  const totalStudents = classes.reduce((s, c) => s + (c.students || 0), 0);
  const published = announcements.filter((a) => a.status === 'published').length;
  const classDetail = resolvePath(ROUTES.FACULTY.CLASS_DETAIL);

  document.getElementById('dashBody').innerHTML = `
    <div class="metric-row">
      ${metric('classes', active.length, 'Active classes')}
      ${metric('users', totalStudents, 'Students reached')}
      ${metric('megaphone', published, 'Published announcements')}
      ${metric('file', papers.length, 'Question papers')}
    </div>

    <section class="section">
      <div class="section-head"><h2>Quick actions</h2></div>
      <div class="quick-actions">
        ${qa('plus', 'Create class', ROUTES.FACULTY.CLASSES)}
        ${qa('message', 'Message a class', ROUTES.FACULTY.CLASSES)}
        ${qa('upload', 'Upload notes', ROUTES.FACULTY.CLASSES)}
        ${qa('file', 'Upload question paper', ROUTES.FACULTY.QUESTION_PAPERS)}
      </div>
    </section>

    <div class="dash-cols mt-6">
      <section class="section">
        <div class="section-head"><h2>My classes</h2>
          <a class="btn btn-sm" href="${resolvePath(ROUTES.FACULTY.CLASSES)}">View all</a></div>
        ${active.length
          ? `<div class="class-grid">${active.slice(0, 4).map((c) => classCard(c, classDetail)).join('')}</div>`
          : emptyState({ iconName: 'classes', title: 'No classes yet', message: 'Create your first class to get started.' })}
      </section>

      <section class="section">
        <div class="section-head"><h2>Recent activity</h2></div>
        <div class="card"><div class="card-body" id="activity"></div></div>
      </section>
    </div>
  `;

  renderActivity(announcements, papers);
}

function metric(iconName, value, label) {
  return `<div class="metric"><div class="m-label">${icon(iconName)} ${esc(label)}</div><div class="m-value">${value}</div></div>`;
}

function qa(iconName, label, route) {
  return `<a class="qa" href="${resolvePath(route)}"><span class="qa-icon">${icon(iconName)}</span>${esc(label)}</a>`;
}

function classCard(c, detailUrl) {
  const archived = c.status === 'archived';
  const subject = c.courseName || c.course;
  return `
    <a class="klass-card compact" href="${detailUrl}?id=${encodeURIComponent(c.id)}">
      <div class="kc-top">
        <span class="kc-avatar" style="background:${avatarColor(subject)}">${esc(initials(subject))}</span>
        <div class="kc-head">
          <div class="kc-title" title="${esc(subject)}">${esc(subject)}</div>
          <div class="kc-sub">${esc(c.program || c.course)} • ${esc(c.branch)} • Sem ${c.semester}</div>
        </div>
        <span class="kc-status ${archived ? 'archived' : ''}">${esc(c.status.charAt(0).toUpperCase() + c.status.slice(1))}</span>
      </div>
      <div class="kc-meta">
        <span class="kc-fact">${icon('users')} ${c.students || 0} students</span>
        <span class="kc-open" style="margin-left:auto">Open ${icon('arrowRight')}</span>
      </div>
    </a>`;
}

function renderActivity(announcements, papers) {
  const items = [
    ...announcements.map((a) => ({ t: a.created, icon: 'megaphone', title: a.title, meta: 'Announcement', badge: typeBadge(a.type) })),
    ...papers.map((p) => ({ t: p.uploaded, icon: 'file', title: p.title, meta: `Question paper · ${p.subject}`, badge: '' })),
  ].sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 6);

  const host = document.getElementById('activity');
  if (!items.length) { host.innerHTML = '<p class="text-muted">No recent activity.</p>'; return; }
  host.innerHTML = `<div class="list-flush">${items.map((i) => `
    <div class="list-row">
      <span class="lr-icon">${icon(i.icon)}</span>
      <div class="lr-main"><div class="lr-title">${esc(i.title)}</div><div class="lr-meta">${esc(i.meta)}</div></div>
      <div class="lr-right">${i.badge}<span class="lr-meta">${esc(timeAgo(i.t))}</span></div>
    </div>`).join('')}</div>`;
}
