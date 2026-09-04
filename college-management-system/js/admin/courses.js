/**
 * admin/courses.js — Course structure overview (B.Tech / Polytechnic),
 * branches and semesters. Read-oriented in Phase 1; write actions are stubbed
 * with informative toasts since the structure is backend-owned later.
 */
import { COURSE_TYPES, BRANCHES, SEMESTER_STRUCTURE } from '../config.js';
import { $, $$, esc } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { toastInfo } from '../common/toast.js';
import { bootstrapAdmin } from './nav.js';

bootstrapAdmin({ activeId: 'courses', title: 'Course Management' }).then((ctx) => { if (ctx) init(ctx); });

function init({ main }) {
  const blocks = [COURSE_TYPES.BTECH, COURSE_TYPES.POLYTECHNIC].map(courseBlock).join('');
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Course Management</h1>
        <p class="page-subtitle">Programs, branches and semester structure across the institute.</p>
      </div>
      <button class="btn btn-primary" id="addBranchBtn">${icon('plus')} Add Branch</button>
    </div>

    <div class="metric-row">
      ${miniStat(2, 'Programs')}
      ${miniStat(BRANCHES.length, 'Branches')}
      ${miniStat(14, 'Total Semesters')}
    </div>

    <div id="courseBlocks">${blocks}</div>
  `;

  // Accordion toggles
  $$('.cb-head', main).forEach((head) =>
    head.addEventListener('click', () => head.parentElement.classList.toggle('open'))
  );
  // Open the first block by default
  main.querySelector('.course-block')?.classList.add('open');

  $('#addBranchBtn').addEventListener('click', () =>
    toastInfo('Branch/semester structure will be editable once the backend is connected.'));
}

function miniStat(value, label) {
  return `<div class="metric"><div class="m-label">${esc(label)}</div><div class="m-value">${value}</div></div>`;
}

function courseBlock(course) {
  const struct = SEMESTER_STRUCTURE[course];
  const years = struct.years
    .map(
      (yr) => `
      <div class="year-group">
        <div class="yg-label">${esc(yr.year)}</div>
        <div class="pill-list">${yr.semesters.map((s) => `<span class="pill">Semester ${s}</span>`).join('')}</div>
      </div>`
    )
    .join('');

  return `
    <div class="course-block">
      <div class="cb-head">
        <div class="flex items-center gap-3">${icon('book')}
          <h3>${esc(course)}</h3>
          <span class="badge badge-brand">${struct.totalSemesters} semesters</span></div>
        <span class="cb-chevron">${icon('chevronDown')}</span>
      </div>
      <div class="cb-body">
        <div class="mb-4">
          <div class="yg-label">Branches</div>
          <div class="pill-list">${BRANCHES.map((b) => `<span class="pill">${esc(b)}</span>`).join('')}</div>
        </div>
        <div class="yg-label">Semester structure</div>
        ${years}
      </div>
    </div>`;
}
