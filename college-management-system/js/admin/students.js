/**
 * admin/students.js — Student directory: list, search, filter, view details.
 */
import { COURSE_TYPES, BRANCHES } from '../config.js';
import { $, $$, esc, debounce, initials } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { statusBadge, emptyState, skeletonCards, paginationBar } from '../common/components.js';
import { openModal } from '../common/modal.js';
import { bootstrapAdmin } from './nav.js';
import { getStudents } from '../services/studentService.js';

const PAGE_SIZE = 6;
let all = [];
let page = 1;

bootstrapAdmin({ activeId: 'students', title: 'Student Management' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main }) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Student Management</h1>
        <p class="page-subtitle">Browse and inspect the student directory.</p>
      </div>
    </div>
    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search name, roll or email…" />
        <select id="fCourse"><option value="">All Courses</option>
          <option>${COURSE_TYPES.BTECH}</option><option>${COURSE_TYPES.POLYTECHNIC}</option></select>
        <select id="fBranch"><option value="">All Branches</option>
          ${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
        <select id="fSem"><option value="">All Semesters</option>
          ${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Semester ${i + 1}</option>`).join('')}</select>
      </div>
    </div></div>
    <div class="card"><div class="card-body"><div id="tableArea">${skeletonCards(1)}</div></div></div>
  `;

  $('#searchInput').addEventListener('input', debounce(() => { page = 1; render(); }, 200));
  ['fCourse', 'fBranch', 'fSem'].forEach((id) => $('#' + id).addEventListener('change', () => { page = 1; render(); }));

  all = await getStudents();
  render();
}

function getFiltered() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const fc = $('#fCourse').value, fb = $('#fBranch').value, fs = $('#fSem').value;
  return all.filter((s) => {
    const mQ = !q || `${s.name} ${s.roll} ${s.email}`.toLowerCase().includes(q);
    const mC = !fc || s.course === fc;
    const mB = !fb || s.branch === fb;
    const mS = !fs || String(s.semester) === fs;
    return mQ && mC && mB && mS;
  });
}

function render() {
  const filtered = getFiltered();
  const host = $('#tableArea');
  if (!filtered.length) {
    host.innerHTML = emptyState({ iconName: 'graduation', title: 'No students found', message: 'Adjust your filters.' });
    return;
  }
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(page, pages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  host.innerHTML = `
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Student</th><th>Roll No.</th><th>Course</th><th>Branch</th><th>Sem</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody>
    </table></div>
    ${paginationBar({ page, pageSize: PAGE_SIZE, total })}
  `;

  $$('[data-view]', host).forEach((b) => b.addEventListener('click', () => onView(b.dataset.view)));
  $$('.page-btn', host).forEach((b) => b.addEventListener('click', () => {
    const p = Number(b.dataset.page);
    if (p >= 1 && p <= pages) { page = p; render(); }
  }));
}

function rowHTML(s) {
  return `
    <tr>
      <td><div class="flex items-center gap-3">
        <div class="avatar" style="width:34px;height:34px;font-size:var(--fs-xs);background:var(--success-600)">${esc(initials(s.name))}</div>
        <div><div style="font-weight:600">${esc(s.name)}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${esc(s.email)}</div></div>
      </div></td>
      <td>${esc(s.roll)}</td>
      <td>${esc(s.course)}</td>
      <td>${esc(s.branch)}</td>
      <td>${s.semester}</td>
      <td>${statusBadge(s.status)}</td>
      <td><button class="btn-icon" data-view="${s.id}" title="View details">${icon('eye')}</button></td>
    </tr>`;
}

function onView(id) {
  const s = all.find((x) => x.id === id);
  openModal({
    title: s.name,
    body: `
      <div class="flex items-center gap-3 mb-4">
        <div class="avatar lg" style="background:var(--success-600)">${esc(initials(s.name))}</div>
        <div><div style="font-weight:700;font-size:var(--fs-lg)">${esc(s.name)}</div>
          <div class="text-muted">${esc(s.email)}</div></div>
      </div>
      <div class="wizard-summary" style="display:flex">
        <div class="ws-item"><div class="k">Roll No.</div><div class="v">${esc(s.roll)}</div></div>
        <div class="ws-item"><div class="k">Course</div><div class="v">${esc(s.course)}</div></div>
        <div class="ws-item"><div class="k">Branch</div><div class="v">${esc(s.branch)}</div></div>
        <div class="ws-item"><div class="k">Semester</div><div class="v">${s.semester}</div></div>
        <div class="ws-item"><div class="k">Status</div><div class="v">${s.status}</div></div>
      </div>
    `,
    actions: [{ label: 'Close', class: 'btn-primary' }],
  });
}
