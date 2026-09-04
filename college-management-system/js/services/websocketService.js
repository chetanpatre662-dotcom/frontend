/**
 * websocketService.js — Real-time seam (Phase 2 placeholder).
 *
 * NOT active in Phase 1. It exposes the exact API the app will use so pages
 * can subscribe to live events without knowing the transport. Today it's a
 * no-op event bus; later connect() opens a real WebSocket to ENV.WS_URL.
 *
 * Intended future flow:
 *   Faculty publishes announcement
 *     -> backend saves to PostgreSQL + emits event
 *     -> WebSocket pushes to relevant connected students
 *     -> student dashboards update instantly via subscribe('announcement:new')
 */
import { ENV } from '../config.js';

const listeners = new Map(); // eventName -> Set<callback>

export function connect() {
  if (ENV.USE_MOCK || !ENV.WS_URL) {
    // No-op in mock mode. Kept intentionally silent.
    return { connected: false, mock: true };
  }
  // Phase 2:
  // const ws = new WebSocket(ENV.WS_URL);
  // ws.onmessage = (e) => { const { event, payload } = JSON.parse(e.data); emit(event, payload); };
  return { connected: false };
}

export function subscribe(eventName, callback) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(callback);
  return () => listeners.get(eventName)?.delete(callback); // unsubscribe
}

/** Emit locally — lets Phase 1 simulate events if desired. */
export function emit(eventName, payload) {
  listeners.get(eventName)?.forEach((cb) => cb(payload));
}
