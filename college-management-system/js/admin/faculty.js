/**
 * admin/faculty.js — Faculty management: list, search, add, edit, toggle status.
 */
import { BRANCHES } from '../config.js';
import { $, $$, esc, formatDate, debounce, initials } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { statusBadge, emptyState, skeletonCards, paginationBar } from '../common/components.js';
import { openModal, confirmDialog } from '../common/modal.js';
import { toastSuccess, toastError } from '../common/toast.js';
import { validateForm, rules, clearErrors } from '../common/validation.js';
import { bootstrapAdmin } from './nav.js';
import { getFaculty, addFaculty, updateFaculty, toggleFacultyStatus } from '../services/facultyService.js';

const PAGE_SIZE = 5;
let all = [];
let page = 1;

bootstrapAdmin({ activeId: 'faculty', title: 'Faculty Management' }).then((ctx) => { if (ctx) init(ctx); });

async function init({ main }) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Faculty Management</h1>
        <p class="page-subtitle">Add, edit and manage faculty accounts.</p>
      </div>
      <button class="btn btn-primary" id="addBtn">${icon('plus')} Add Faculty</button>
    </div>
    <div class="card mb-4"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="searchInput" type="search" placeholder="Search name, email or department…" />
        <select id="fStatus"><option value="">All Status</option>
          <option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>
    </div></div>
    <div class="card"><div class="card-body"><div id="tableArea">${skeletonCards(1)}</div></div></div>
  `;

  $('#addBtn').addEventListener('click', () => openForm());
  $('#searchInput').addEventListener('input', debounce(() => { page = 1; render(); }, 200));
  $('#fStatus').addEventListener('change', () => { page = 1; render(); });

  await load();
}

async function load() { all = await getFaculty(); render(); }

function getFiltered() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const fs = $('#fStatus').value;
  return all.filter((f) => {
    const mQ = !q || `${f.name} ${f.email} ${f.department}`.toLowerCase().includes(q);
    const mS = !fs || f.status === fs;
    return mQ && mS;
  });
}

function render() {
  const filtered = getFiltered();
  const host = $('#tableArea');
  if (!filtered.length) {
    host.innerHTML = emptyState({ iconName: 'user', title: 'No faculty found', message: 'Adjust filters or add a new faculty member.' });
    return;
  }
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(page, pages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  host.innerHTML = `
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Faculty</th><th>Department</th><th>Designation</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody>
    </table></div>
    ${paginationBar({ page, pageSize: PAGE_SIZE, total })}
  `;

  $$('[data-edit]', host).forEach((b) => b.addEventListener('click', () => openForm(b.dataset.edit)));
  $$('[data-toggle]', host).forEach((b) => b.addEventListener('click', () => onToggle(b.dataset.toggle)));
  $$('.page-btn', host).forEach((b) => b.addEventListener('click', () => {
    const p = Number(b.dataset.page);
    if (p >= 1 && p <= pages) { page = p; render(); }
  }));
}

function rowHTML(f) {
  return `
    <tr>
      <td><div class="flex items-center gap-3">
        <div class="avatar" style="width:34px;height:34px;font-size:var(--fs-xs)">${esc(initials(f.name))}</div>
        <div><div style="font-weight:600">${esc(f.name)}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${esc(f.email)}</div></div>
      </div></td>
      <td>${esc(f.department)}</td>
      <td>${esc(f.designation)}</td>
      <td>${formatDate(f.joined)}</td>
      <td>${statusBadge(f.status)}</td>
      <td><div class="row-actions">
        <button class="btn-icon" data-edit="${f.id}" title="Edit">${icon('edit')}</button>
        <button class="btn btn-sm ${f.status === 'active' ? 'btn-ghost' : 'btn-outline'}" data-toggle="${f.id}">
          ${f.status === 'active' ? 'Deactivate' : 'Activate'}</button>
      </div></td>
    </tr>`;
}

async function onToggle(id) {
  const f = all.find((x) => x.id === id);
  const goingInactive = f.status === 'active';
  if (goingInactive) {
    const ok = await confirmDialog({
      title: 'Deactivate faculty?',
      message: `${f.name} will lose portal access until reactivated.`,
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
  }
  await toggleFacultyStatus(id);
  toastSuccess(`${f.name} ${goingInactive ? 'deactivated' : 'activated'}.`);
  await load();
}

function openForm(editId) {
  const existing = editId ? all.find((x) => x.id === editId) : null;
  const { close, el } = openModal({
    title: existing ? 'Edit faculty' : 'Add faculty',
    body: `
      <form id="facForm" novalidate>
        <div class="form-group">
          <label class="form-label" for="name">Full name <span class="req">*</span></label>
          <input class="input" id="name" name="name" placeholder="e.g. Dr. Anita Sharma" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="email">Email <span class="req">*</span></label>
          <input class="input" id="email" name="email" type="email" placeholder="name@miet.edu" />
          <div class="field-error"></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="department">Department <span class="req">*</span></label>
            <select id="department" name="department">${BRANCHES.map((b) => `<option>${b}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="designation">Designation <span class="req">*</span></label>
            <select id="designation" name="designation">
              <option>Assistant Professor</option><option>Associate Professor</option><option>Professor</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="phone">Phone</label>
          <input class="input" id="phone" name="phone" placeholder="+91 …" />
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: existing ? 'Update' : 'Add', class: 'btn-primary', closeOnClick: false, onClick: () => submit() },
    ],
  });

  const form = $('#facForm', el);
  if (existing) {
    form.elements['name'].value = existing.name;
    form.elements['email'].value = existing.email;
    form.elements['department'].value = existing.department;
    form.elements['designation'].value = existing.designation;
    form.elements['phone'].value = existing.phone || '';
  }

  async function submit() {
    clearErrors(form);
    const ok = validateForm(form, {
      name: [rules.required],
      email: [rules.required, rules.email],
    });
    if (!ok) return;

    const payload = {
      name: form.elements['name'].value.trim(),
      email: form.elements['email'].value.trim(),
      department: form.elements['department'].value,
      designation: form.elements['designation'].value,
      phone: form.elements['phone'].value.trim(),
    };
    const res = existing ? await updateFaculty(existing.id, payload) : await addFaculty(payload);
    if (!res.ok) return toastError(res.error || 'Save failed.');
    toastSuccess(existing ? 'Faculty updated.' : 'Faculty added.');
    close();
    await load();
  }
}
