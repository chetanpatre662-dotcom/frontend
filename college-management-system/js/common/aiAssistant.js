/**
 * aiAssistant.js — Shared Universal AI Assistant UI (LLM-style).
 * -----------------------------------------------------------------------------
 * Renders a two-pane chat: left = chat history (New Chat, search, list),
 * right = conversation area with empty-state suggestions, message bubbles,
 * a typing indicator and a composer with keyboard shortcut (Enter to send).
 *
 * It talks ONLY to aiService.ask() and aiChatService for persistence. There is
 * no real LLM yet — aiService is a documented mock. The disclaimer in the UI
 * makes that explicit to users.
 * -----------------------------------------------------------------------------
 */
import { $, $$, esc, timeAgo, initials } from './dom.js';
import { icon } from './icons.js';
import { ask, suggestedPrompts } from '../services/aiService.js';
import { listChats, getChat, createChat, appendMessage, deleteChat } from '../services/aiChatService.js';
import { confirmDialog } from './modal.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.main #appMain
 * @param {object} opts.user authenticated identity (+merged profile)
 * @param {'student'|'faculty'|'admin'} opts.role
 * @param {object} opts.profile academic/context profile passed to aiService
 */
export function renderAssistant({ main, user, role, profile }) {
  const ownerUid = user.uid || 'anon';
  let activeChatId = null;
  let busy = false;

  main.innerHTML = `
    <div class="ai-layout">
      <aside class="ai-history">
        <div class="aih-head">
          <button class="btn aih-new" id="newChat">${icon('plusCircle')} New chat</button>
        </div>
        <div class="aih-search">
          <input class="input" id="chatSearch" type="search" placeholder="Search chats…" />
        </div>
        <div class="aih-list" id="chatList"></div>
      </aside>

      <section class="ai-main">
        <div class="ai-scroll" id="aiScroll"></div>
        <div class="ai-composer-wrap">
          <div class="ai-composer">
            <textarea id="aiInput" rows="1" placeholder="Ask anything about your college management system…"></textarea>
            <button class="ai-send" id="aiSend" aria-label="Send" disabled>${icon('send')}</button>
          </div>
          <div class="ai-disclaimer">AI responses are generated from your accessible data. Actions are added once the AI backend is connected.</div>
        </div>
      </section>
    </div>
  `;

  const scroll = $('#aiScroll', main);
  const input = $('#aiInput', main);
  const sendBtn = $('#aiSend', main);

  /* ---------- chat history ---------- */
  function renderHistory() {
    const q = ($('#chatSearch', main).value || '').trim().toLowerCase();
    const chats = listChats(ownerUid).filter((c) => !q || c.title.toLowerCase().includes(q));
    const list = $('#chatList', main);
    if (!chats.length) {
      list.innerHTML = `<div class="aih-empty">No chats yet. Start a new conversation.</div>`;
      return;
    }
    list.innerHTML = chats.map((c) => `
      <div class="aih-item ${c.id === activeChatId ? 'active' : ''}" data-chat="${c.id}">
        ${icon('message')}
        <span class="aih-title">${esc(c.title)}</span>
        <button class="btn-icon aih-del" data-del="${c.id}" aria-label="Delete chat">${icon('trash')}</button>
      </div>`).join('');

    $$('.aih-item', list).forEach((el) =>
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del]')) return;
        openChat(el.dataset.chat);
      })
    );
    $$('[data-del]', list).forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog({ title: 'Delete chat?', message: 'This conversation will be removed.', confirmLabel: 'Delete' });
        if (!ok) return;
        deleteChat(btn.dataset.del);
        if (activeChatId === btn.dataset.del) { activeChatId = null; renderWelcome(); }
        renderHistory();
      })
    );
  }

  /* ---------- conversation ---------- */
  function renderWelcome() {
    const prompts = suggestedPrompts(role);
    scroll.innerHTML = `
      <div class="ai-welcome">
        <div class="aiw-badge">${icon('sparkles')}</div>
        <h2>Ask anything about your college</h2>
        <p>I answer using only the data you're allowed to see — your classes, notes, announcements and more.</p>
        <div class="ai-suggestions">
          ${prompts.map((p) => `<button type="button" class="ai-suggestion" data-prompt="${esc(p)}">${icon('arrowRight')} ${esc(p)}</button>`).join('')}
        </div>
      </div>`;
    $$('.ai-suggestion', scroll).forEach((el) =>
      el.addEventListener('click', () => { input.value = el.dataset.prompt; onSend(); })
    );
  }

  function renderThread(chat) {
    scroll.innerHTML = `<div class="ai-thread" id="thread"></div>`;
    const thread = $('#thread', scroll);
    chat.messages.forEach((m) => thread.appendChild(bubble(m)));
    scrollToBottom();
  }

  function bubble(m) {
    const el = document.createElement('div');
    el.className = `ai-msg ${m.role}`;
    el.innerHTML = `
      <div class="ai-ava">${m.role === 'assistant' ? icon('sparkles') : esc(initials(user.name || 'You'))}</div>
      <div style="flex:1">
        <div class="ai-role">${m.role === 'assistant' ? 'Assistant' : 'You'}</div>
        <div class="ai-body">${esc(m.text)}</div>
      </div>`;
    return el;
  }

  function typingBubble() {
    const el = document.createElement('div');
    el.className = 'ai-msg assistant';
    el.id = 'typing';
    el.innerHTML = `
      <div class="ai-ava">${icon('sparkles')}</div>
      <div style="flex:1">
        <div class="ai-role">Assistant</div>
        <div class="ai-typing"><span></span><span></span><span></span></div>
      </div>`;
    return el;
  }

  function scrollToBottom() { scroll.scrollTop = scroll.scrollHeight; }

  function openChat(id) {
    const chat = getChat(id);
    if (!chat) return;
    activeChatId = id;
    renderThread(chat);
    renderHistory();
  }

  /* ---------- send flow ---------- */
  async function onSend() {
    const text = input.value.trim();
    if (!text || busy) return;

    // Ensure a chat exists.
    if (!activeChatId) {
      const chat = createChat(ownerUid);
      activeChatId = chat.id;
    }

    const userMsg = { role: 'user', text, at: new Date().toISOString() };
    appendMessage(activeChatId, userMsg);

    // Render (fresh thread if we were on welcome).
    let thread = $('#thread', scroll);
    if (!thread) { renderThread(getChat(activeChatId)); thread = $('#thread', scroll); }
    else thread.appendChild(bubble(userMsg));

    input.value = '';
    autoGrow();
    updateSendState();
    renderHistory();

    // Typing indicator
    busy = true;
    const typing = typingBubble();
    thread.appendChild(typing);
    scrollToBottom();

    const answer = await ask({ role, profile, text });
    typing.remove();
    appendMessage(activeChatId, answer);
    thread.appendChild(bubble(answer));
    scrollToBottom();
    busy = false;
    renderHistory();
  }

  /* ---------- composer behaviour ---------- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }
  function updateSendState() { sendBtn.disabled = input.value.trim() === '' || busy; }

  input.addEventListener('input', () => { autoGrow(); updateSendState(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  sendBtn.addEventListener('click', onSend);
  $('#newChat', main).addEventListener('click', () => { activeChatId = null; renderWelcome(); renderHistory(); input.focus(); });
  $('#chatSearch', main).addEventListener('input', renderHistory);

  // Initial state
  renderWelcome();
  renderHistory();
  updateSendState();
  input.focus();
}
