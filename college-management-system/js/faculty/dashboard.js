/**
 * faculty/dashboard.js — Unified Faculty home: AI Assistant (primary, chat-first)
 * + a secondary dashboard rail with real metrics, quick actions, My Classes and
 * recent activity. ALL data from the backend (no mock). Merged from the old
 * dashboard + assistant.
 */
import { ROUTES, resolvePath } from '../config.js';
import { esc, timeAgo, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { loadingState, emptyState } from '../common/components.js';
import { bootstrapFaculty } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';
import { getFacultyClasses } from '../services/classApiService.js';
import { getFacultyDashboard } from '../services/dashboardService.js';

bootstrapFaculty({ activeId: 'dashboard', title: 'Home' }).then((ctx) => { if (ctx) init(ctx); });

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ACTIVITY_ICON = { note: 'file', question_paper: 'file', assignment: 'clipboard', project: 'folder' };
const ACTIVITY_LABEL = { note: 'Note', question_paper: 'Question paper', assignment: 'Assignment', project: 'Project' };

function init({ main, user }) {
  const firstName = (user.name || 'there').split(' ')[0];
  const desig = user.designation || 'Faculty';
  const dept = user.department ? ` · ${esc(user.department)}` : '';
  const greeting = `<span class="ai-greet-hi">${esc(greetingWord())}, ${esc(firstName)}</span>
    <span class="ai-greet-sub">${esc(desig)}${dept} &mdash; ask me anything or manage your classes.</span>`;

  renderAssistant({
    main,
    user,
    role: 'faculty',
    greeting,
    dashboard: { title: 'My Workspace', render: renderRail },
  });
}

async function renderRail(container) {
  container.innerHTML = loadingState('Loading your workspace…');

  const [dashRes, classesRes] = await Promise.all([getFacultyDashboard(), getFacultyClasses()]);

  if (!dashRes.ok) {
    container.innerHTML = errorHTML(dashRes.error || 'Could not load your dashboard.');
    container.querySelector('#dashRetry')?.addEventListener('click', () => renderRail(container));
    return;
  }

  const stats = dashRes.stats || {};
  const recent = dashRes.recentActivity || [];
  const classes = classesRes.ok ? (classesRes.classes || []) : [];
  const active = classes.filter((c) => c.status === 'active');
  const classDetail = resolvePath(ROUTES.FACULTY.CLASS_DETAIL);

  container.innerHTML = `
    <div class="rail-metrics">
      ${metric('classes', stats.classes ?? 0, 'Classes')}
      ${metric('users', stats.studentsReached ?? 0, 'Students')}
      ${metric('megaphone', stats.announcements ?? 0, 'Announcements')}
      ${metric('file', stats.questionPapers ?? 0, 'Papers')}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>Quick actions</span></div>
      <div class="rail-actions">
        ${qa('plus', 'Create class', ROUTES.FACULTY.CLASSES)}
        ${qa('megaphone', 'Announce', ROUTES.FACULTY.ANNOUNCEMENTS)}
        ${qa('file', 'Upload paper', ROUTES.FACULTY.QUESTION_PAPERS)}
        ${qa('calendar', 'Events', ROUTES.FACULTY.EVENTS)}
      </div>
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>My Classes</span>
        <a class="btn btn-sm" href="${resolvePath(ROUTES.FACULTY.CLASSES)}">All</a></div>
      ${active.length
        ? `<div class="rail-classes">${active.slice(0, 5).map((c) => classCard(c, classDetail)).join('')}</div>`
        : emptyState({ iconName: 'classes', title: 'No classes yet', message: 'Create your first class to get started.' })}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>Recent activity</span></div>
      <div class="card"><div class="card-body" id="railActivity">${renderActivity(recent)}</div></div>
    </div>
  `;
}

function metric(iconName, value, label) {
  return `<div class="rail-metric"><div class="rm-value">${esc(String(value))}</div><div class="rm-label">${icon(iconName)} ${esc(label)}</div></div>`;
}
function qa(iconName, label, route) {
  return `<a class="rail-qa" href="${resolvePath(route)}"><span class="qa-icon">${icon(iconName)}</span>${esc(label)}</a>`;
}

function classCard(c, detailUrl) {
  const subject = c.subject || c.title || 'Class';
  return `
    <a class="rail-class" href="${detailUrl}?id=${encodeURIComponent(c.id)}">
      <span class="rc-avatar" style="background:${avatarColor(subject)}">${esc(initials(subject))}</span>
      <span class="rc-body"><span class="rc-title" title="${esc(subject)}">${esc(subject)}</span>
        <span class="rc-sub">${esc(c.course)} • ${esc(c.branch)} • Sem ${esc(String(c.semester))}</span></span>
      <span class="rc-open">${icon('arrowRight')}</span>
    </a>`;
}

function renderActivity(recent) {
  if (!recent.length) return '<p class="text-muted">No recent activity.</p>';
  return `<div class="list-flush">${recent.slice(0, 6).map((i) => `
    <div class="list-row">
      <span class="lr-icon">${icon(ACTIVITY_ICON[i.kind] || 'file')}</span>
      <div class="lr-main"><div class="lr-title">${esc(i.title)}</div><div class="lr-meta">${esc(ACTIVITY_LABEL[i.kind] || 'Item')}</div></div>
      <div class="lr-right"><span class="lr-meta">${esc(timeAgo(i.createdAt))}</span></div>
    </div>`).join('')}</div>`;
}

function errorHTML(message) {
  return `<div class="card"><div class="card-body" style="text-align:center;padding:16px">
    <div class="text-muted" style="margin-bottom:12px">${icon('alert')} ${esc(message)}</div>
    <button class="btn btn-primary btn-sm" id="dashRetry">${icon('arrowRight')} Retry</button></div></div>`;
}
