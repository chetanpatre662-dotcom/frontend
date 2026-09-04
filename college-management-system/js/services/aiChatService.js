/**
 * aiChatService.js — Local persistence for AI chat sessions (mock).
 * -----------------------------------------------------------------------------
 * Stores chat threads in localStorage so "New Chat" + chat history work in the
 * AI Assistant UI. Scoped per Firebase UID so chats don't leak between accounts
 * on a shared device. Phase 2: threads live server-side, keyed by Firebase UID.
 * -----------------------------------------------------------------------------
 */
import { STORAGE_KEYS } from '../config.js';
import { uid } from '../common/dom.js';

const KEY = STORAGE_KEYS.AI_CHATS;

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function writeAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

/** List a user's chats, newest first. */
export function listChats(ownerUid) {
  const map = readAll();
  return Object.values(map)
    .filter((c) => c.ownerUid === ownerUid)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

export function getChat(id) {
  return readAll()[id] || null;
}

export function createChat(ownerUid) {
  const map = readAll();
  const chat = {
    id: uid('CHAT'),
    ownerUid,
    title: 'New chat',
    messages: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  map[chat.id] = chat;
  writeAll(map);
  return chat;
}

/** Append a message ({role,text,...}) and update the title from the first user msg. */
export function appendMessage(chatId, message) {
  const map = readAll();
  const chat = map[chatId];
  if (!chat) return null;
  chat.messages.push(message);
  if (chat.title === 'New chat' && message.role === 'user') {
    chat.title = message.text.slice(0, 40) + (message.text.length > 40 ? '…' : '');
  }
  chat.updated = new Date().toISOString();
  writeAll(map);
  return chat;
}

export function deleteChat(id) {
  const map = readAll();
  delete map[id];
  writeAll(map);
}
