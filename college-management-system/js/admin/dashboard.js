/**
 * admin/dashboard.js — Administration overview: real institute metrics,
 * management shortcuts, and recent announcements. No decorative graphics or
 * fabricated analytics — every number maps to a real (mock) collection.
 */
import { ROUTES, resolvePath } from '../config.js';
import { esc, timeAgo } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { typeBadge, loadingState } from '../common/components.js';
import { bootstrapAdmin } from './nav.js';
import { getFaculty } from '../services/facultyService.js';
import { getStudents } from '../services/studentService.js';
import { getClasses } from '../services/classService.js';
import { getAnnouncements } from '../services/announcementService.js';
import { getPapers } from '../services/questionPaperService.js';

bootstrapAdmin({ activeId: 'dashboard', title: 'Overview' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main, user }) {
  const firstName = (user.name || 'Administrator').split(' ')[0];
  main.innerHTML = `
    <div class="greeting">
      <div>
        <h1 class="g-title">Overview</h1>
        <div class="g-sub">Signed in as ${esc(user.name || 'Administrator')} · ${esc(user.designation || 'Admin')}</div>
      </div>
    </div>
    <div id="dashBody">${loadingState('Loading overview…')}</div>
  `;

  const [faculty, students, classes, anns, papers] = await Promise.all([
    getFaculty(), getStudents(), getClasses(), getAnnouncements(), getPapers(),
  ]);
  const activeClasses = classes.filter((c) => c.status === 'active').length;

  document.getElementById('dashBody').innerHTML = `
    <div class="metric-row">
      ${metric('graduation', students.length, 'Students', ROUTES.ADMIN.STUDENTS)}
      ${metric('user', faculty.length, 'Faculty', ROUTES.ADMIN.FACULTY)}
      ${metric('classes', activeClasses, 'Active classes', ROUTES.ADMIN.CLASSES)}
      ${metric('megaphone', anns.length, 'Announcements', null)}
      ${metric('file', papers.length, 'Question papers', null)}
    </div>

    <div class="dash-cols">
      <section class="section">
        <div class="section-head"><h2>Recent announcements</h2></div>
        <div class="card"><div class="card-body">
          ${anns.length
            ? `<div class="list-flush">${anns.slice(0, 6).map(annRow).join('')}</div>`
            : '<p class="text-muted">No announcements yet.</p>'}
        </div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Manage</h2></div>
        <div class="card"><div class="card-body">
          <div class="list-flush">
            ${link('Student directory', ROUTES.ADMIN.STUDENTS, 'graduation')}
            ${link('Faculty accounts', ROUTES.ADMIN.FACULTY, 'user')}
            ${link('Classes', ROUTES.ADMIN.CLASSES, 'classes')}
            ${link('Courses & branches', ROUTES.ADMIN.COURSES, 'book')}
            ${link('System settings', ROUTES.ADMIN.SETTINGS, 'settings')}
          </div>
        </div></div>
      </section>
    </div>
  `;
}

function metric(iconName, value, label, route) {
  const inner = `<div class="metric"><div class="m-label">${icon(iconName)} ${esc(label)}</div><div class="m-value">${value}</div></div>`;
  return route ? `<a href="${resolvePath(route)}" style="text-decoration:none">${inner}</a>` : inner;
}

function link(label, route, iconName) {
  return `<a class="list-link" href="${resolvePath(route)}"><span class="lr-icon">${icon(iconName)}</span>
    <span class="lr-title">${esc(label)}</span><span class="ll-chev">${icon('chevronRight')}</span></a>`;
}

function annRow(a) {
  return `<div class="list-row"><span class="lr-icon">${icon('megaphone')}</span>
    <div class="lr-main"><div class="lr-title">${esc(a.title)}</div><div class="lr-meta">${esc(timeAgo(a.created))}</div></div>
    <div class="lr-right">${typeBadge(a.type)}</div></div>`;
}
