/**
 * faculty/question-papers.js — Upload + manage previous question papers.
 * File storage is deferred to Firebase (Phase 2); we capture metadata + name.
 */
import { COURSE_TYPES, BRANCHES, DEMO_CONTENT } from '../config.js';
import { $, $$, esc, formatDate, debounce } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { emptyState, skeletonCards } from '../common/components.js';
import { openModal, confirmDialog } from '../common/modal.js';
import { toastSuccess, toastError, toastInfo } from '../common/toast.js';
import { validateForm, rules, clearErrors, setFieldError } from '../common/validation.js';
import { bootstrapFaculty } from './nav.js';
import { getPapers, uploadPaper, deletePaper } from '../services/questionPaperService.js';
import { getClasses } from '../services/classService.js';

let FACULTY_ID;
let all = [];
let facultyClasses = [];

bootstrapFaculty({ activeId: 'papers', title: 'Question Papers' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main, user }) {
  // Demo content owner — decoupled from the authenticated Firebase identity.
  FACULTY_ID = DEMO_CONTENT.FACULTY_OWNER_ID;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Previous Question Papers</h1>
        <p class="page-subtitle">Upload and organize question papers by course, branch and subject.</p>
      </div>
      <button class="btn btn-primary" id="uploadBtn">${icon('upload')} Upload Paper</button>
    </div>

    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search by subject or title…" />
        <select id="filterCourse"><option value="">All Courses</option>
          <option>${COURSE_TYPES.BTECH}</option><option>${COURSE_TYPES.POLYTECHNIC}</option></select>
        <select id="filterBranch"><option value="">All Branches</option>
          ${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
      </div>
    </div></div>

    <div id="list">${skeletonCards(3)}</div>
  `;

  $('#uploadBtn').addEventListener('click', openUpload);
  $('#searchInput').addEventListener('input', debounce(render, 200));
  $('#filterCourse').addEventListener('change', render);
  $('#filterBranch').addEventListener('change', render);

  await load();
}

async function load() {
  [all, facultyClasses] = await Promise.all([
    getPapers({ facultyId: FACULTY_ID }),
    getClasses({ facultyId: FACULTY_ID }),
  ]);
  render();
}

function render() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const fc = $('#filterCourse').value;
  const fb = $('#filterBranch').value;

  const filtered = all.filter((p) => {
    const matchQ = !q || `${p.title} ${p.subject}`.toLowerCase().includes(q);
    const matchC = !fc || p.course === fc;
    const matchB = !fb || p.branch === fb;
    return matchQ && matchC && matchB;
  });

  const host = $('#list');
  if (!filtered.length) {
    host.innerHTML = emptyState({
      iconName: 'file',
      title: all.length ? 'No matching papers' : 'No question papers yet',
      message: all.length ? 'Adjust your filters.' : 'Upload your first question paper.',
    });
    return;
  }

  host.innerHTML = `<div class="table-wrap card"><table class="data-table">
    <thead><tr><th>Paper</th><th>Course</th><th>Branch</th><th>Sem</th><th>Subject</th><th>Year</th><th>Uploaded</th><th>Actions</th></tr></thead>
    <tbody>${filtered.map(rowHTML).join('')}</tbody>
  </table></div>`;

  $$('[data-dl]', host).forEach((b) => b.addEventListener('click', () =>
    toastInfo('Download will stream from Firebase Storage once connected.')));
  $$('[data-view]', host).forEach((b) => b.addEventListener('click', () => onView(b.dataset.view)));
  $$('[data-del]', host).forEach((b) => b.addEventListener('click', () => onDelete(b.dataset.del)));
}

function rowHTML(p) {
  return `
    <tr>
      <td><div class="flex items-center gap-2">${icon('file')}<strong>${esc(p.title)}</strong></div></td>
      <td>${esc(p.course)}</td>
      <td>${esc(p.branch)}</td>
      <td>${p.semester}</td>
      <td>${esc(p.subject)}</td>
      <td>${esc(p.year)}</td>
      <td>${formatDate(p.uploaded)}</td>
      <td><div class="row-actions">
        <button class="btn-icon" data-view="${p.id}" title="View">${icon('eye')}</button>
        <button class="btn-icon" data-dl="${p.id}" title="Download">${icon('download')}</button>
        <button class="btn-icon" data-del="${p.id}" title="Delete">${icon('trash')}</button>
      </div></td>
    </tr>`;
}

function onView(id) {
  const p = all.find((x) => x.id === id);
  openModal({
    title: p.title,
    body: `
      <div class="wizard-summary" style="display:flex">
        <div class="ws-item"><div class="k">Course</div><div class="v">${esc(p.course)}</div></div>
        <div class="ws-item"><div class="k">Branch</div><div class="v">${esc(p.branch)}</div></div>
        <div class="ws-item"><div class="k">Semester</div><div class="v">${p.semester}</div></div>
        <div class="ws-item"><div class="k">Subject</div><div class="v">${esc(p.subject)}</div></div>
        <div class="ws-item"><div class="k">Year</div><div class="v">${esc(p.year)}</div></div>
        <div class="ws-item"><div class="k">File</div><div class="v">${esc(p.file)}</div></div>
      </div>
      <p class="text-muted mt-4">A PDF preview will render here after Firebase Storage integration.</p>
    `,
    actions: [{ label: 'Close', class: 'btn-primary' }],
  });
}

async function onDelete(id) {
  const p = all.find((x) => x.id === id);
  const ok = await confirmDialog({ title: 'Delete paper?', message: `"${p.title}" will be removed.`, confirmLabel: 'Delete' });
  if (!ok) return;
  await deletePaper(id);
  toastSuccess('Question paper deleted.');
  await load();
}

function openUpload() {
  const years = Array.from({ length: 8 }, (_, i) => 2026 - i);
  const { close, el } = openModal({
    title: 'Upload question paper',
    size: 'modal-lg',
    body: `
      <form id="qpForm" novalidate>
        <div class="form-group">
          <label class="form-label" for="classId">Attach to class</label>
          <select id="classId" name="classId">
            <option value="">General (not linked to a class)</option>
            ${facultyClasses.map((c) => `<option value="${c.id}">${esc(c.courseName || c.course)} · ${esc(c.branch)} · Sem ${c.semester}</option>`).join('')}
          </select>
          <div class="text-muted" style="font-size:var(--fs-xs);margin-top:4px">Choosing a class fills course, branch and semester automatically and shows the paper in that class.</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="course">Course <span class="req">*</span></label>
            <select id="course" name="course"><option>${COURSE_TYPES.BTECH}</option><option>${COURSE_TYPES.POLYTECHNIC}</option></select>
          </div>
          <div class="form-group">
            <label class="form-label" for="branch">Branch <span class="req">*</span></label>
            <select id="branch" name="branch">${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="semester">Semester <span class="req">*</span></label>
            <select id="semester" name="semester">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Semester ${i + 1}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="year">Academic year <span class="req">*</span></label>
            <select id="year" name="year">${years.map((y) => `<option>${y}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="subject">Subject <span class="req">*</span></label>
          <input class="input" id="subject" name="subject" placeholder="e.g. Data Structures" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="title">Paper title <span class="req">*</span></label>
          <input class="input" id="title" name="title" placeholder="e.g. Data Structures — End Sem" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="file">Question paper file <span class="req">*</span></label>
          <input class="input" id="file" name="file" type="file" accept=".pdf,.doc,.docx" />
          <div class="field-error"></div>
          <div class="text-muted" style="font-size:var(--fs-xs);margin-top:4px">PDF/DOC. Uploaded to Firebase Cloud Storage in Phase 2.</div>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: `${icon('upload')} Upload`, class: 'btn-primary', closeOnClick: false, onClick: () => submit() },
    ],
  });

  const form = $('#qpForm', el);
  const uploadActionBtn = el.querySelectorAll('.modal-footer .btn')[1];

  // Selecting a class auto-fills + locks course/branch/semester.
  const classSel = form.elements['classId'];
  const courseSel = form.elements['course'];
  const branchSel = form.elements['branch'];
  const semSel = form.elements['semester'];
  classSel.addEventListener('change', () => {
    const c = facultyClasses.find((x) => x.id === classSel.value);
    const locked = Boolean(c);
    if (c) {
      courseSel.value = c.program || c.course;
      branchSel.value = c.branch;
      semSel.value = String(c.semester);
    }
    [courseSel, branchSel, semSel].forEach((s) => { s.disabled = locked; });
  });

  async function submit() {
    clearErrors(form);
    const ok = validateForm(form, { subject: [rules.required], title: [rules.required] });
    const fileInput = form.elements['file'];
    let fileOk = true;
    if (!fileInput.files.length) { setFieldError(fileInput, 'Please choose a file.'); fileOk = false; }
    if (!ok || !fileOk) return;

    uploadActionBtn.disabled = true;
    uploadActionBtn.innerHTML = '<span class="spinner"></span> Uploading…';

    const res = await uploadPaper({
      facultyId: FACULTY_ID,
      classId: classSel.value || null,
      course: courseSel.value,
      branch: branchSel.value,
      semester: Number(semSel.value),
      subject: form.elements['subject'].value.trim(),
      year: form.elements['year'].value,
      title: form.elements['title'].value.trim(),
      fileName: fileInput.files[0].name,
    });

    if (!res.ok) {
      uploadActionBtn.disabled = false;
      uploadActionBtn.innerHTML = `${icon('upload')} Upload`;
      return toastError('Upload failed.');
    }
    toastSuccess('Question paper uploaded.');
    close();
    await load();
  }
}
