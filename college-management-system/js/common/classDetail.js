/**
 * classDetail.js — Shared Class Detail view (Overview / Messages / Notes /
 * Question Papers / Members). Used by student and faculty class pages.
 *
 * Role-aware: faculty (owner) can post messages and upload notes; students get
 * a read-only view. All write actions are frontend mocks routed through the
 * services; the backend must re-check ownership/membership by Firebase UID.
 */
import { resolvePath } from '../config.js';
import { $, $$, esc, formatDate, timeAgo, initials, uid } from './dom.js';
import { icon } from './icons.js';
import { emptyState, loadingState } from './components.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';
import { getClass } from '../services/classService.js';
import { getMessages, sendMessage } from '../services/messageService.js';
import { getNotes, uploadNote } from '../services/notesService.js';
import { getPapers, uploadPaper } from '../services/questionPaperService.js';
import { getClassMembers } from '../services/studentClassService.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.main  the #appMain element
 * @param {object} opts.user authenticated identity (+merged profile)
 * @param {'student'|'faculty'|'admin'} opts.role
 * @param {string} opts.backUrl resolved URL to the class list
 * @param {boolean} opts.canManage whether this user can post/upload
 */
export async function renderClassDetail({ main, user, role, backUrl, canManage }) {
  const params = new URLSearchParams(window.location.search);
  const classId = params.get('id');

  main.innerHTML = loadingState('Loading class…');

  const cls = classId ? await getClass(classId) : null;
  if (!cls) {
    main.innerHTML = `
      <div class="page-head"><a class="btn btn-sm" href="${backUrl}">${icon('arrowLeft')} Back</a></div>
      ${emptyState({ iconName: 'classes', title: 'Class not found', message: 'This class may have been removed.' })}`;
    return;
  }

  const [messages, notes, papers, members] = await Promise.all([
    getMessages({ classId: cls.id }),
    getNotes({ classId: cls.id }),
    getPapers(),
    getClassMembers(cls),
  ]);
  // Question papers relevant to this class: either explicitly attached to this
  // class (classId) OR matching its program/branch/semester.
  const classPapers = papers.filter(
    (p) => p.classId === cls.id ||
      (p.course === (cls.program || cls.course) && p.branch === cls.branch && Number(p.semester) === Number(cls.semester))
  );

  // Tab definitions (content is order-independent).
  const TAB_DEFS = {
    overview: { label: 'Overview', panel: overviewHTML(cls, messages, notes, classPapers, members) },
    messages: { label: `Messages <span class="tab-count">${messages.length}</span>`, panel: messagesHTML(messages, canManage) },
    notes: { label: `Notes <span class="tab-count">${notes.length}</span>`, panel: notesHTML(notes, canManage) },
    papers: { label: `Question Papers <span class="tab-count">${classPapers.length}</span>`, panel: papersHTML(classPapers, canManage) },
    members: { label: `Members <span class="tab-count">${members.length}</span>`, panel: membersHTML(members) },
  };

  /* Tab ORDER + default active tab.
     Both faculty and student open on Messages/Stream first, with Overview
     moved to the end. Admin keeps Overview first (management-oriented). */
  const tabOrder = role === 'admin'
    ? ['overview', 'messages', 'notes', 'papers', 'members']
    : ['messages', 'notes', 'papers', 'members', 'overview'];
  const defaultTab = tabOrder[0];

  const tabButtons = tabOrder
    .map((key) => `<button class="tab ${key === defaultTab ? 'active' : ''}" data-tab="${key}">${TAB_DEFS[key].label}</button>`)
    .join('');
  const tabPanels = tabOrder
    .map((key) => `<div class="tab-panel ${key === defaultTab ? 'active' : ''}" data-panel="${key}">${TAB_DEFS[key].panel}</div>`)
    .join('');

  main.innerHTML = `
    <div class="page-head">
      <a class="btn btn-sm" href="${backUrl}">${icon('arrowLeft')} Back to classes</a>
    </div>

    <div class="class-hero">
      <h1>${esc(cls.courseName || 'Class')}</h1>
      <div class="ch-sub">
        <span>${esc(cls.program || cls.course)} • ${esc(cls.branch)} • Semester ${cls.semester}</span>
        <span>·</span>
        <span>${esc(cls.facultyName || 'Faculty')}</span>
        <span>·</span>
        <span>${members.length} student${members.length === 1 ? '' : 's'}</span>
        <span class="kc-status ${cls.status === 'archived' ? 'archived' : ''}">${esc((cls.status || 'active').charAt(0).toUpperCase() + (cls.status || 'active').slice(1))}</span>
      </div>
      ${cls.description ? `<p class="ch-desc">${esc(cls.description)}</p>` : ''}
    </div>

    <div class="tabs" role="tablist">${tabButtons}</div>
    ${tabPanels}
  `;

  // Tab switching
  $$('.tab', main).forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('.tab', main).forEach((b) => b.classList.toggle('active', b === btn));
      const panel = btn.dataset.tab;
      $$('.tab-panel', main).forEach((p) => p.classList.toggle('active', p.dataset.panel === panel));
    })
  );

  // Faculty-only write actions. Re-bound after each live re-render.
  let pendingAttachment = null; // { name, kind } chosen for the next message

  function wireManage() {
    if (!canManage) return;

    // --- Message attachment picker ---
    const fileInput = $('#msgFile', main);
    const attachBtn = $('#msgAttach', main);
    const attachName = $('#msgAttachName', main);
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        pendingAttachment = f ? { name: f.name, kind: attachmentKind(f.name) } : null;
        if (attachName) {
          attachName.textContent = f ? `Attached: ${f.name}` : '';
          attachName.classList.toggle('hidden', !f);
        }
      });
    }

    // --- Post message (text and/or attachment) ---
    const sendBtn = $('#msgSend', main);
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const ta = $('#msgBody', main);
        const body = ta.value.trim();
        if (!body && !pendingAttachment) { toastError('Write a message or attach a file first.'); return; }
        sendBtn.disabled = true;
        const res = await sendMessage({
          classId: cls.id,
          facultyId: user.uid || cls.facultyId,
          facultyName: user.name || cls.facultyName,
          body,
          attachment: pendingAttachment,
        });
        sendBtn.disabled = false;
        if (!res.ok) { toastError('Could not send message.'); return; }
        pendingAttachment = null;
        toastSuccess('Message posted to the class.');
        // Live re-render mirrors the future WebSocket push to members.
        const list = await getMessages({ classId: cls.id });
        $('[data-panel="messages"]', main).innerHTML = messagesHTML(list, canManage);
        wireManage();
      });
    }

    // --- Notes upload ---
    $('#noteUpload', main)?.addEventListener('click', () => openNoteUpload(cls, user, main, canManage, wireManage));

    // --- Question paper upload (scoped to this class) ---
    $('#paperUpload', main)?.addEventListener('click', () => openClassPaperUpload(cls, user, main, canManage, wireManage));
  }
  wireManage();
}

/** Classify a chosen message-attachment file into a coarse kind for the chip. */
function attachmentKind(fileName = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  return 'file';
}

/* ---------------- panel renderers ---------------- */

function overviewHTML(cls, messages, notes, papers, members) {
  const latestMsg = messages[messages.length - 1];
  const latestNote = notes[0];
  return `
    <div class="metric-row" style="margin-bottom:var(--sp-5)">
      ${statMini(members.length, 'Members')}
      ${statMini(messages.length, 'Messages')}
      ${statMini(notes.length, 'Notes')}
      ${statMini(papers.length, 'Question Papers')}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:var(--sp-4)">
      <div class="card"><div class="card-header"><span class="card-title">Latest message</span></div>
        <div class="card-body">${latestMsg
          ? `<div style="font-weight:600">${esc(latestMsg.facultyName)}</div>
             <p class="text-muted" style="font-size:var(--fs-sm);margin-top:4px">${esc(latestMsg.body)}</p>
             <div class="text-muted" style="font-size:var(--fs-xs);margin-top:6px">${esc(timeAgo(latestMsg.created))}</div>`
          : '<p class="text-muted">No messages yet.</p>'}</div>
      </div>
      <div class="card"><div class="card-header"><span class="card-title">Latest note</span></div>
        <div class="card-body">${latestNote
          ? `<div style="font-weight:600">${esc(latestNote.title)}</div>
             <p class="text-muted" style="font-size:var(--fs-sm);margin-top:4px">${esc(latestNote.description || latestNote.fileName)}</p>
             <div class="text-muted" style="font-size:var(--fs-xs);margin-top:6px">${esc(formatDate(latestNote.created))}</div>`
          : '<p class="text-muted">No notes uploaded yet.</p>'}</div>
      </div>
    </div>`;
}

function statMini(value, label) {
  return `<div class="metric"><div class="m-label">${esc(label)}</div><div class="m-value">${value}</div></div>`;
}

function messagesHTML(messages, canManage) {
  const composer = canManage ? `
    <div class="msg-composer">
      <textarea class="input" id="msgBody" placeholder="Message your class… (e.g. Tomorrow's practical starts at 10 AM)"></textarea>
      <input type="file" id="msgFile" class="hidden" accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx" />
      <button class="btn-icon" id="msgAttach" type="button" title="Attach a file" aria-label="Attach a file">${icon('paperclip')}</button>
      <button class="btn btn-primary" id="msgSend">${icon('send')} Post</button>
    </div>
    <div id="msgAttachName" class="msg-attach-name hidden"></div>` : '';

  const list = messages.length
    ? `<div class="msg-list">${[...messages].reverse().map(messageItem).join('')}</div>`
    : emptyState({ iconName: 'message', title: 'No messages yet', message: canManage ? 'Post the first message to your class.' : 'Your faculty has not posted any messages yet.' });
  return `${list}${composer}`;
}

function messageItem(m) {
  return `
    <div class="msg-item ${m.unread ? 'unread' : ''}">
      <div class="msg-avatar">${esc(initials(m.facultyName))}</div>
      <div style="flex:1">
        <div class="msg-head">
          <span class="msg-author">${esc(m.facultyName)}</span>
          <span class="msg-time">${esc(timeAgo(m.created))}</span>
        </div>
        ${m.body ? `<div class="msg-body">${esc(m.body)}</div>` : ''}
        ${m.attachment ? attachmentChip(m.attachment) : ''}
      </div>
    </div>`;
}

/** Small download chip / image thumbnail for an attachment { name, kind, link }. */
function attachmentChip(att) {
  if (att.kind === 'image') {
    return `<div class="att-thumb" title="${esc(att.name)}">${icon('file')}<span>${esc(att.name)}</span>
      <button class="btn-icon" title="Download" aria-label="Download ${esc(att.name)}">${icon('download')}</button></div>`;
  }
  if (att.kind === 'link') {
    return `<a class="att-chip" href="${esc(att.link || '#')}" target="_blank" rel="noopener">${icon('arrowRight')} ${esc(att.name || att.link)}</a>`;
  }
  return `<div class="att-chip">${icon('file')} <span>${esc(att.name)}</span>
    <button class="btn-icon" title="Download" aria-label="Download ${esc(att.name)}">${icon('download')}</button></div>`;
}

function notesHTML(notes, canManage) {
  const uploadBtn = canManage
    ? `<div class="mb-4"><button class="btn btn-primary" id="noteUpload">${icon('upload')} Upload note</button></div>`
    : '';
  if (!notes.length) {
    return uploadBtn + emptyState({ iconName: 'file', title: 'No notes yet', message: canManage ? 'Upload study material for your class.' : 'No study material has been shared yet.' });
  }
  const rows = notes.map((n) => {
    const meta = [n.description || (n.link ? 'External resource' : n.fileName), formatDate(n.created), n.uploadedByName || 'Faculty']
      .filter(Boolean).map(esc).join(' · ');
    const action = n.link
      ? `<a class="btn-icon" href="${esc(n.link)}" target="_blank" rel="noopener" title="Open link">${icon('arrowRight')}</a>`
      : `<button class="btn-icon" data-dl title="Download">${icon('download')}</button>`;
    return `
    <div class="note-row">
      <div class="note-thumb kind-${esc(n.kind || (n.link ? 'link' : 'file'))}">${icon(noteIconFor(n))}</div>
      <div style="flex:1">
        <div class="note-title">${esc(n.title)}</div>
        <div class="note-desc">${meta}</div>
      </div>
      <div class="note-actions">${action}</div>
    </div>`;
  }).join('');
  return `${uploadBtn}${rows}`;
}

function noteIconFor(n) {
  if (n.link && !n.fileName) return 'arrowRight';
  if (n.kind === 'image') return 'file';
  return 'file';
}

function papersHTML(papers, canManage) {
  const uploadBtn = canManage
    ? `<div class="mb-4"><button class="btn btn-primary" id="paperUpload">${icon('upload')} Upload question paper</button></div>`
    : '';
  if (!papers.length) {
    return uploadBtn + emptyState({ iconName: 'download', title: 'No question papers', message: canManage ? 'Upload a previous question paper for this class.' : 'No previous question papers for this class yet.' });
  }
  const rows = papers.map((p) => `
    <div class="note-row">
      <div class="note-thumb kind-pdf">${icon('file')}</div>
      <div style="flex:1">
        <div class="note-title">${esc(p.subject)} — ${esc(p.year)}</div>
        <div class="note-desc">${esc(p.title)}</div>
      </div>
      <div class="note-actions"><button class="btn-icon" data-dl title="Download">${icon('download')}</button></div>
    </div>`).join('');
  return `${uploadBtn}${rows}`;
}

function membersHTML(members) {
  if (!members.length) {
    return emptyState({ iconName: 'users', title: 'No members yet', message: 'No students currently match this class\'s program, branch and semester.' });
  }
  return `<div class="card"><div class="card-body" style="padding:0">${members.map((s) => `
    <div class="member-row">
      <div class="m-avatar">${esc(initials(s.name))}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:var(--fs-sm)">${esc(s.name)}</div>
        <div class="text-muted" style="font-size:var(--fs-xs)">${esc(s.roll)} · ${esc(s.email)}</div>
      </div>
    </div>`).join('')}</div></div>`;
}

/* ---------------- note upload modal ---------------- */
import { openModal } from './modal.js';
import { validateForm, rules, clearErrors, setFieldError } from './validation.js';

function openNoteUpload(cls, user, main, canManage, wireManage) {
  const { close, el } = openModal({
    title: `Upload note — ${cls.courseName}`,
    body: `
      <form id="noteForm" novalidate>
        <div class="form-group">
          <label class="form-label" for="title">Title <span class="req">*</span></label>
          <input class="input" id="title" name="title" placeholder="e.g. Unit 3 — Semantic Analysis" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="description">Description</label>
          <input class="input" id="description" name="description" placeholder="Short summary (optional)" />
        </div>
        <div class="form-group">
          <label class="form-label" for="file">File</label>
          <input class="input" id="file" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif" />
          <div class="text-muted" style="font-size:var(--fs-xs);margin-top:4px">PDF, Word, slides or images. Stored in Firebase Cloud Storage once the backend is connected.</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="link">Or external resource link</label>
          <input class="input" id="link" name="link" type="url" placeholder="https://… (optional)" />
          <div class="field-error"></div>
        </div>
      </form>`,
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: `${icon('upload')} Upload`, class: 'btn-primary', closeOnClick: false, onClick: () => submit() },
    ],
  });

  const form = $('#noteForm', el);
  const uploadBtn = el.querySelectorAll('.modal-footer .btn')[1];

  async function submit() {
    clearErrors(form);
    const ok = validateForm(form, { title: [rules.required] });
    const fileInput = form.elements['file'];
    const link = form.elements['link'].value.trim();
    // Require at least a file OR a link.
    if (ok && !fileInput.files.length && !link) {
      setFieldError(form.elements['link'], 'Attach a file or provide a resource link.');
      return;
    }
    if (!ok) return;

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Uploading…';
    const res = await uploadNote({
      classId: cls.id,
      title: form.elements['title'].value.trim(),
      description: form.elements['description'].value.trim(),
      fileName: fileInput.files.length ? fileInput.files[0].name : '',
      link,
      uploadedBy: user.uid || cls.facultyId,
      uploadedByName: user.name || cls.facultyName,
    });
    if (!res.ok) { uploadBtn.disabled = false; uploadBtn.innerHTML = `${icon('upload')} Upload`; toastError('Upload failed.'); return; }
    toastSuccess('Note uploaded.');
    close();
    const notes = await getNotes({ classId: cls.id });
    $('[data-panel="notes"]', main).innerHTML = notesHTML(notes, canManage);
    if (typeof wireManage === 'function') wireManage(); // re-bind upload button
  }
}

/** Upload a question paper scoped to THIS class (from the class Papers tab). */
function openClassPaperUpload(cls, user, main, canManage, wireManage) {
  const years = Array.from({ length: 8 }, (_, i) => 2026 - i);
  const { close, el } = openModal({
    title: `Upload question paper — ${cls.courseName}`,
    body: `
      <form id="qpClassForm" novalidate>
        <div class="form-group">
          <label class="form-label" for="subject">Subject <span class="req">*</span></label>
          <input class="input" id="subject" name="subject" value="${esc(cls.courseName || '')}" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="title">Paper title <span class="req">*</span></label>
          <input class="input" id="title" name="title" placeholder="e.g. ${esc(cls.courseName || 'Subject')} — End Sem" />
          <div class="field-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="year">Academic year <span class="req">*</span></label>
          <select id="year" name="year">${years.map((y) => `<option>${y}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="file">Question paper file <span class="req">*</span></label>
          <input class="input" id="file" name="file" type="file" accept=".pdf,.doc,.docx" />
          <div class="field-error"></div>
          <div class="text-muted" style="font-size:var(--fs-xs);margin-top:4px">This paper will appear in this class and in the main Question Papers list.</div>
        </div>
      </form>`,
    actions: [
      { label: 'Cancel', class: 'btn-ghost' },
      { label: `${icon('upload')} Upload`, class: 'btn-primary', closeOnClick: false, onClick: () => submit() },
    ],
  });

  const form = $('#qpClassForm', el);
  const uploadBtn = el.querySelectorAll('.modal-footer .btn')[1];

  async function submit() {
    clearErrors(form);
    const ok = validateForm(form, { subject: [rules.required], title: [rules.required] });
    const fileInput = form.elements['file'];
    let fileOk = true;
    if (!fileInput.files.length) { setFieldError(fileInput, 'Please choose a file.'); fileOk = false; }
    if (!ok || !fileOk) return;

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Uploading…';
    const res = await uploadPaper({
      facultyId: cls.facultyId,
      classId: cls.id, // links the paper to this class
      course: cls.program || cls.course,
      branch: cls.branch,
      semester: Number(cls.semester),
      subject: form.elements['subject'].value.trim(),
      year: form.elements['year'].value,
      title: form.elements['title'].value.trim(),
      fileName: fileInput.files[0].name,
    });
    if (!res.ok) { uploadBtn.disabled = false; uploadBtn.innerHTML = `${icon('upload')} Upload`; toastError('Upload failed.'); return; }
    toastSuccess('Question paper uploaded.');
    close();
    // Re-render papers tab with the class's papers (classId + matching).
    const all = await getPapers();
    const classPapers = all.filter(
      (p) => p.classId === cls.id ||
        (p.course === (cls.program || cls.course) && p.branch === cls.branch && Number(p.semester) === Number(cls.semester))
    );
    $('[data-panel="papers"]', main).innerHTML = papersHTML(classPapers, canManage);
    if (typeof wireManage === 'function') wireManage();
  }
}
