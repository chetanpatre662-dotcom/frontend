/**
 * admin/dashboard.js — Unified Admin home: AI Assistant (primary, chat-first)
 * + a secondary dashboard rail with real user/system counts, quick actions and
 * management shortcuts. Counts come from GET /api/admin/stats (PostgreSQL).
 * Matches the exact structural pattern of faculty/dashboard.js and
 * student/dashboard.js so all three panels share one coherent layout.
 */
import { ROUTES, resolvePath } from '../config.js';
import { esc } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { loadingState } from '../common/components.js';
import { bootstrapAdmin } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';
import { getAdminStats } from '../services/adminService.js';

bootstrapAdmin({ activeId: 'dashboard', title: 'Home' }).then((ctx) => { if (ctx) init(ctx); });

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function init({ main, user }) {
  const firstName = (user.name || 'Administrator').split(' ')[0];
  const greeting = `<span class="ai-greet-hi">${esc(greetingWord())}, ${esc(firstName)}</span>
    <span class="ai-greet-sub">Admin &mdash; ask about college data or jump to management.</span>`;

  renderAssistant({
    main,
    user,
    role: 'admin',
    greeting,
    dashboard: { title: 'Overview', render: renderRail },
  });
}

async function renderRail(container) {
  container.innerHTML = loadingState('Loading overview…');
  const res = await getAdminStats();

  if (!res.ok) {
    container.innerHTML = errorHTML(res.error || 'Could not load statistics.');
    container.querySelector('#retryStats')?.addEventListener('click', () => renderRail(container));
    return;
  }

  const s = res.stats || {};

  container.innerHTML = `
    <div class="rail-metrics">
      ${metricLink('users',      s.totalUsers    ?? 0, 'Total users',  null)}
      ${metricLink('graduation', s.students      ?? 0, 'Students',     ROUTES.ADMIN.STUDENTS)}
      ${metricLink('user',       s.faculty       ?? 0, 'Faculty',      ROUTES.ADMIN.FACULTY)}
      ${metricLink('shield',     s.admins        ?? 0, 'Admins',       null)}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>System</span></div>
      <div class="rail-metrics">
        ${metricLink('checkCircle', s.pendingFaculty ?? 0, 'Pending faculty', ROUTES.ADMIN.REQUESTS)}
        ${metricLink('shield',      s.pendingAdmins  ?? 0, 'Pending admins',  ROUTES.ADMIN.REQUESTS)}
        ${metricLink('classes',     s.classes        ?? 0, 'Classes',         ROUTES.ADMIN.CLASSES)}
        ${metricLink('book',        s.subjects       ?? 0, 'Subjects',        ROUTES.ADMIN.COURSES)}
      </div>
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>Quick actions</span></div>
      <div class="rail-actions">
        ${qa('graduation', 'Students',   ROUTES.ADMIN.STUDENTS)}
        ${qa('user',       'Faculty',    ROUTES.ADMIN.FACULTY)}
        ${qa('bell',       'Requests',   ROUTES.ADMIN.REQUESTS)}
        ${qa('classes',    'Classes',    ROUTES.ADMIN.CLASSES)}
        ${qa('book',       'Courses',    ROUTES.ADMIN.COURSES)}
        ${qa('file',       'AI Docs',    ROUTES.ADMIN.AI_DOCUMENTS)}
        ${qa('settings',   'Settings',   ROUTES.ADMIN.SETTINGS)}
        ${qa('shield',     'Admins',     ROUTES.ADMIN.MANAGEMENT)}
      </div>
    </div>
  `;
}

/** Metric card — linked when route is provided, plain card otherwise. */
function metricLink(iconName, value, label, route) {
  const inner = `
    <div class="rail-metric">
      <div class="rm-value">${esc(String(value))}</div>
      <div class="rm-label">${icon(iconName)} ${esc(label)}</div>
    </div>`;
  return route
    ? `<a href="${resolvePath(route)}" class="rail-metric-link">${inner}</a>`
    : inner;
}

/** Quick-action button — exactly the same component faculty uses. */
function qa(iconName, label, route) {
  return `<a class="rail-qa" href="${resolvePath(route)}">
    <span class="qa-icon">${icon(iconName)}</span>${esc(label)}
  </a>`;
}

function errorHTML(message) {
  return `<div class="card"><div class="card-body" style="text-align:center;padding:16px">
    <div class="text-muted" style="margin-bottom:12px">${icon('alert')} ${esc(message)}</div>
    <button class="btn btn-primary btn-sm" id="retryStats">${icon('arrowRight')} Retry</button>
  </div></div>`;
}
