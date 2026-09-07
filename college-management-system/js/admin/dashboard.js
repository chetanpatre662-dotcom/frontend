/**
 * admin/dashboard.js — Unified Admin home: AI Assistant (primary, chat-first)
 * + a secondary dashboard rail with real user/system counts and management
 * shortcuts. Counts come from GET /api/admin/stats (PostgreSQL). No mock data.
 * Merged from the old admin overview + assistant.
 */
import { ROUTES, resolvePath } from '../config.js';
import { esc } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { loadingState } from '../common/components.js';
import { bootstrapAdmin } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';
import { getAdminStats } from '../services/adminService.js';

bootstrapAdmin({ activeId: 'dashboard', title: 'Home' }).then((ctx) => { if (ctx) init(ctx); });

function init({ main, user }) {
  const greeting = `<span class="ai-greet-hi">Administration</span>
    <span class="ai-greet-sub">Signed in as ${esc(user.name || 'Administrator')} — ask about college data or jump to management.</span>`;

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
      ${metric('users', s.totalUsers ?? 0, 'Total users', null)}
      ${metric('graduation', s.students ?? 0, 'Students', ROUTES.ADMIN.STUDENTS)}
      ${metric('user', s.faculty ?? 0, 'Faculty', ROUTES.ADMIN.FACULTY)}
      ${metric('shield', s.admins ?? 0, 'Admins', null)}
      ${metric('checkCircle', s.pendingFaculty ?? 0, 'Pending', ROUTES.ADMIN.FACULTY)}
      ${metric('classes', s.classes ?? 0, 'Classes', ROUTES.ADMIN.CLASSES)}
      ${metric('book', s.subjects ?? 0, 'Subjects', ROUTES.ADMIN.COURSES)}
    </div>

    <div class="rail-section">
      <div class="rail-sec-head"><span>Manage</span></div>
      <div class="card"><div class="card-body">
        <div class="list-flush">
          ${link('Student directory', ROUTES.ADMIN.STUDENTS, 'graduation')}
          ${link('Faculty accounts', ROUTES.ADMIN.FACULTY, 'user')}
          ${link('Requests', ROUTES.ADMIN.REQUESTS, 'bell')}
          ${link('Classes', ROUTES.ADMIN.CLASSES, 'classes')}
          ${link('Courses & branches', ROUTES.ADMIN.COURSES, 'book')}
          ${link('AI documents', ROUTES.ADMIN.AI_DOCUMENTS, 'file')}
          ${link('System settings', ROUTES.ADMIN.SETTINGS, 'settings')}
        </div>
      </div></div>
    </div>
  `;
}

function metric(iconName, value, label, route) {
  const inner = `<div class="rail-metric"><div class="rm-value">${esc(String(value))}</div><div class="rm-label">${icon(iconName)} ${esc(label)}</div></div>`;
  return route ? `<a href="${resolvePath(route)}" class="rail-metric-link">${inner}</a>` : inner;
}

function link(label, route, iconName) {
  return `<a class="list-link" href="${resolvePath(route)}"><span class="lr-icon">${icon(iconName)}</span>
    <span class="lr-title">${esc(label)}</span><span class="ll-chev">${icon('chevronRight')}</span></a>`;
}

function errorHTML(message) {
  return `<div class="card"><div class="card-body" style="text-align:center;padding:16px">
    <div class="text-muted" style="margin-bottom:12px">${icon('alert')} ${esc(message)}</div>
    <button class="btn btn-primary btn-sm" id="retryStats">${icon('arrowRight')} Retry</button></div></div>`;
}
