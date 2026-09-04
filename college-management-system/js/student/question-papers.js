/**
 * student/question-papers.js — Browse/filter previous question papers.
 * Students filter by course, branch, semester, subject and year.
 */
import { COURSE_TYPES, BRANCHES, DEMO_CONTENT } from '../config.js';
import { $, $$, esc, formatDate, debounce } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { emptyState, skeletonCards } from '../common/components.js';
import { toastInfo } from '../common/toast.js';
import { bootstrapStudent } from './nav.js';
import { getPapers } from '../services/questionPaperService.js';

let all = [];

bootstrapStudent({ activeId: 'papers', title: 'Question Papers' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main, user: identity }) {
  // Demo academic profile (not part of authentication) merged with identity.
  const user = { ...DEMO_CONTENT.STUDENT_PROFILE, ...identity };
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Previous Question Papers</h1>
        <p class="page-subtitle">Browse question papers across courses, branches and years.</p>
      </div>
    </div>
    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search subject or title…" />
        <select id="fCourse"><option value="">All Courses</option>
          <option>${COURSE_TYPES.BTECH}</option><option>${COURSE_TYPES.POLYTECHNIC}</option></select>
        <select id="fBranch"><option value="">All Branches</option>
          ${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
        <select id="fSem"><option value="">All Semesters</option>
          ${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Semester ${i + 1}</option>`).join('')}</select>
        <select id="fYear"><option value="">All Years</option>
          ${Array.from({ length: 6 }, (_, i) => `<option>${2025 - i}</option>`).join('')}</select>
      </div>
    </div></div>
    <div id="list">${skeletonCards(3)}</div>
  `;

  // Pre-select the student's own branch/semester for a personalized default view.
  $('#fCourse').value = user.course || '';
  $('#fBranch').value = user.branch || '';
  $('#fSem').value = user.semester ? String(user.semester) : '';

  ['searchInput'].forEach((id) => $('#' + id).addEventListener('input', debounce(render, 200)));
  ['fCourse', 'fBranch', 'fSem', 'fYear'].forEach((id) => $('#' + id).addEventListener('change', render));

  all = await getPapers();
  render();
}

function render() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const fc = $('#fCourse').value, fb = $('#fBranch').value, fs = $('#fSem').value, fy = $('#fYear').value;

  const filtered = all.filter((p) => {
    const mQ = !q || `${p.title} ${p.subject}`.toLowerCase().includes(q);
    const mC = !fc || p.course === fc;
    const mB = !fb || p.branch === fb;
    const mS = !fs || String(p.semester) === fs;
    const mY = !fy || String(p.year) === fy;
    return mQ && mC && mB && mS && mY;
  });

  const host = $('#list');
  if (!filtered.length) {
    host.innerHTML = emptyState({ iconName: 'file', title: 'No papers found', message: 'Try adjusting the filters above.' });
    return;
  }

  host.innerHTML = `<div class="grid grid-cards">${filtered
    .map(
      (p) => `
      <div class="card">
        <div class="card-body">
          <div class="flex items-center gap-2" style="color:var(--brand-600)">${icon('file')}
            <span class="badge badge-brand">${esc(p.year)}</span></div>
          <h3 class="mt-2" style="font-size:var(--fs-md)">${esc(p.subject)}</h3>
          <p class="text-muted" style="font-size:var(--fs-sm)">${esc(p.title)}</p>
          <div class="mt-2" style="font-size:var(--fs-xs);color:var(--text-muted)">
            ${esc(p.course)} · ${esc(p.branch)} · Semester ${p.semester}
          </div>
          <div class="flex gap-2 mt-4">
            <button class="btn btn-sm btn-outline" data-view="${p.id}">${icon('eye')} View</button>
            <button class="btn btn-sm btn-primary" data-dl="${p.id}">${icon('download')} Download</button>
          </div>
        </div>
      </div>`
    )
    .join('')}</div>`;

  $$('[data-dl]', host).forEach((b) => b.addEventListener('click', () =>
    toastInfo('Download will be available once Firebase Storage is connected.')));
  $$('[data-view]', host).forEach((b) => b.addEventListener('click', () =>
    toastInfo('PDF preview will render after backend integration.')));
}
