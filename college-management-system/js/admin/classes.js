/**
 * admin/classes.js — Institute-wide class directory (read-only).
 * Admin can browse/search/filter all classes and inspect membership counts.
 */
import { COURSE_TYPES, BRANCHES } from '../config.js';
import { $, $$, esc, formatDate, debounce, initials, avatarColor } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { emptyState, skeletonCards } from '../common/components.js';
import { openModal } from '../common/modal.js';
import { bootstrapAdmin } from './nav.js';
import { getClasses } from '../services/classService.js';
import { getClassMembers } from '../services/studentClassService.js';

let all = [];

bootstrapAdmin({ activeId: 'classes', title: 'Classes' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main }) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Classes</h1>
        <p class="page-subtitle">All classes across the institute. Membership is derived from each class's program, branch and semester.</p>
      </div>
    </div>
    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search course, faculty or branch…" />
        <select id="fCourse"><option value="">All Programs</option>
          <option>${COURSE_TYPES.BTECH}</option><option>${COURSE_TYPES.POLYTECHNIC}</option></select>
        <select id="fBranch"><option value="">All Branches</option>
          ${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
        <select id="fStatus"><option value="">All Status</option>
          <option value="active">Active</option><option value="archived">Archived</option></select>
      </div>
    </div></div>
    <div id="grid">${skeletonCards(3)}</div>
  `;

  $('#searchInput').addEventListener('input', debounce(render, 200));
  ['fCourse', 'fBranch', 'fStatus'].forEach((id) => $('#' + id).addEventListener('change', render));

  all = await getClasses();
  render();
}

function render() {
  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const fc = $('#fCourse').value, fb = $('#fBranch').value, fst = $('#fStatus').value;

  const filtered = all.filter((c) => {
    const hay = `${c.courseName || ''} ${c.facultyName || ''} ${c.branch}`.toLowerCase();
    return (!q || hay.includes(q)) &&
      (!fc || (c.program || c.course) === fc) &&
      (!fb || c.branch === fb) &&
      (!fst || c.status === fst);
  });

  const host = $('#grid');
  if (!filtered.length) {
    host.innerHTML = emptyState({ iconName: 'classes', title: 'No classes found', message: 'Adjust your filters.' });
    return;
  }

  host.innerHTML = `<div class="class-grid">${filtered.map(cardHTML).join('')}</div>`;
  $$('[data-view]', host).forEach((card) => {
    card.addEventListener('click', () => onView(card.dataset.view));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') onView(card.dataset.view); });
  });
}

function cardHTML(c) {
  const archived = c.status === 'archived';
  const subject = c.courseName || c.course;
  return `
    <div class="klass-card" role="button" tabindex="0" data-view="${c.id}">
      <div class="kc-top">
        <span class="kc-avatar" style="background:${avatarColor(subject)}">${esc(initials(subject))}</span>
        <div class="kc-head">
          <div class="kc-title" title="${esc(subject)}">${esc(subject)}</div>
          <div class="kc-sub">${esc(c.program || c.course)} • ${esc(c.branch)} • Sem ${c.semester}</div>
        </div>
        <span class="kc-status ${archived ? 'archived' : ''}">${esc(c.status.charAt(0).toUpperCase() + c.status.slice(1))}</span>
      </div>
      <div class="kc-meta">
        <span class="kc-fact">${esc(c.facultyName || 'Faculty')}</span>
      </div>
      <div class="kc-foot">
        <span class="kc-activity">${icon('users')} ${c.students || 0} Students</span>
        <span class="kc-open">Open ${icon('arrowRight')}</span>
      </div>
    </div>`;
}

async function onView(id) {
  const c = all.find((x) => x.id === id);
  if (!c) return;
  const members = await getClassMembers(c);
  openModal({
    title: c.courseName || c.course,
    body: `
      <div class="wizard-summary" style="display:flex">
        <div class="ws-item"><div class="k">Program</div><div class="v">${esc(c.program || c.course)}</div></div>
        <div class="ws-item"><div class="k">Branch</div><div class="v">${esc(c.branch)}</div></div>
        <div class="ws-item"><div class="k">Semester</div><div class="v">${c.semester}</div></div>
        <div class="ws-item"><div class="k">Faculty</div><div class="v">${esc(c.facultyName || 'Faculty')}</div></div>
        <div class="ws-item"><div class="k">Matching students</div><div class="v">${members.length}</div></div>
        <div class="ws-item"><div class="k">Created</div><div class="v">${formatDate(c.created)}</div></div>
      </div>
      ${c.description ? `<p class="text-muted mt-4">${esc(c.description)}</p>` : ''}
    `,
    actions: [{ label: 'Close', class: 'btn-primary' }],
  });
}
