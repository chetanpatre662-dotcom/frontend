/**
 * student/dashboard.js — Unified Student home: AI Assistant (primary, chat-first)
 * + a secondary dashboard rail with real academic context, My Classes, content
 * counts and relevant announcements. ALL data from the backend (no mock).
 *
 * The chat is the primary focus; the dashboard rail keeps the previously
 * separate overview one glance away. Merged from the old dashboard + assistant.
 */
import { ROUTES, resolvePath } from '../config.js';
import { esc, timeAgo, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { typeBadge, emptyState, loadingState } from '../common/components.js';
import { bootstrapStudent } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';
import { getForStudent } from '../services/announcementService.js';
import { getStudentClasses } from '../services/classApiService.js';
import { getStudentDashboard } from '../services/dashboardService.js';

bootstrapStudent({ activeId: 'dashboard', title: 'Home' }).then((ctx) => { if (ctx) init(ctx); });

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function init({ main, user }) {
  const firstName = (user.name || 'there').split(' ')[0];
  const greeting = `<span class="ai-greet-hi">${esc(greetingWord())}, ${esc(firstName)}</span>
    <span class="ai-greet-sub">Ask me about your classes, papers, announcements and more.</span>`;

  renderAssistant({
    main,
    user,
    role: 'student',
    greeting,
    dashboard: { title: 'My Dashboard', render: renderRail },
  });
}

/** Populate the dashboard rail with the student's real overview. */
async function renderRail(container) {
  container.innerHTML = loadingState('Loading your dashboard…');

  const [dashRes, classesRes, annRes] = await Promise.all([
    getStudentDashboard(), getStudentClasses(), getForStudent(),
  ]);

  if (!dashRes.ok) {
    container.innerHTML = errorHTML(dashRes.error || 'Could not load your dashboard.');
    container.querySelector('#dashRetry')?.addEventListener('click', () => renderRail(container));
    return;
  }

  const profile = dashRes.profile || {};
  const stats = dashRes.stats || {};
  const classes = classesRes.ok ? (classesRes.classes || []) : [];
  const anns = annRes.ok ? (annRes.items || []) : [];
  const classDetail = resolvePath(ROUTES.STUDENT.CLASS_DETAIL);

  container.innerHTML = `
    <div class="rail-context">${icon('graduation')} ${esc(profile.course || '')} • ${esc(profile.branch || '')} • Sem ${esc(String(profile.semester ?? ''))}</div>

    <div class="rail-metrics">
      ${metric('classes', stats.classes ?? 0, 'Classes')}
      ${metric('file', stats.notes ?? 0, 'Notes')}
      ${metric('file', stats.questionPapers ?? 0, 'Papers')}
      ${metric('clipboard', stats.assignments ?? 0, 'Assignments')}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>My Classes</span>
        <a class="btn btn-sm" href="${resolvePath(ROUTES.STUDENT.CLASSES)}">All</a></div>
      ${classes.length
        ? `<div class="rail-classes">${classes.slice(0, 5).map((c) => classCard(c, classDetail)).join('')}</div>`
        : emptyState({ iconName: 'classes', title: 'No classes yet', message: 'Classes for your group appear here automatically.' })}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>Announcements</span>
        <a class="btn btn-sm" href="${resolvePath(ROUTES.STUDENT.ANNOUNCEMENTS)}">All</a></div>
      <div class="card"><div class="card-body">
        ${anns.length
          ? `<div class="list-flush">${anns.slice(0, 4).map(annRow).join('')}</div>`
          : emptyRow('No announcements', 'Nothing relevant right now.')}
      </div></div>
    </div>
  `;
}

function metric(iconName, value, label) {
  return `<div class="rail-metric"><div class="rm-value">${esc(String(value))}</div><div class="rm-label">${icon(iconName)} ${esc(label)}</div></div>`;
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

function annRow(a) {
  return `
    <div class="list-row">
      <span class="lr-icon">${icon('megaphone')}</span>
      <div class="lr-main"><div class="lr-title">${esc(a.title)}</div>
        <div class="lr-meta">${esc(timeAgo(a.created))}</div></div>
      <div class="lr-right">${a.type ? typeBadge(a.type) : ''}</div>
    </div>`;
}

function emptyRow(title, message) {
  return `<div class="text-muted" style="padding:var(--sp-2) 0"><strong style="display:block;color:var(--gray-700)">${esc(title)}</strong>${esc(message)}</div>`;
}

function errorHTML(message) {
  return `<div class="card"><div class="card-body" style="text-align:center;padding:16px">
    <div class="text-muted" style="margin-bottom:12px">${icon('alert')} ${esc(message)}</div>
    <button class="btn btn-primary btn-sm" id="dashRetry">${icon('arrowRight')} Retry</button></div></div>`;
}
