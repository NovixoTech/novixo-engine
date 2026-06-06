/**
 * events.js — Novixo Engine (Phase 7g)
 * Event Emitter System.
 *
 * THE PROBLEM:
 * Currently developers hook into Novixo only through config callbacks:
 *   onSyncSuccess, onSyncFailure, onQueueChange...
 *
 * This works but is inflexible. You can only register one handler
 * per event, and you must do it at init() time.
 *
 * THE SOLUTION — EVENT EMITTER:
 * A familiar on/off/once/emit pattern that any developer knows.
 *
 * HOW TO USE:
 *   Novixo.on("synced",  (item) => updateUI(item));
 *   Novixo.on("failed",  (item, err) => showError(err));
 *   Novixo.on("network", (state) => setNetworkBadge(state));
 *   Novixo.on("queued",  (item) => showPendingBadge());
 *   Novixo.on("safemode", (stats) => showWarningBanner());
 *
 *   // Remove listener
 *   Novixo.off("synced", handler);
 *
 *   // One-time listener
 *   Novixo.once("synced", (item) => showSuccessToast());
 */

// ── Event constants ───────────────────────────

export const NovixoEvent = {
  QUEUED:         "queued",
  SYNCED:         "synced",
  FAILED:         "failed",
  RETRY:          "retry",
  NETWORK:        "network",
  SAFE_MODE_ON:   "safemode:on",
  SAFE_MODE_OFF:  "safemode:off",
  LOW_NETWORK_ON: "lownetwork:on",
  LOW_NETWORK_OFF:"lownetwork:off",
  CONFLICT:       "conflict",
  DUPLICATE:      "duplicate",
  TIMEOUT:        "timeout",
  QUEUE_CHANGE:   "queue:change",
  INIT:           "init",
  DESTROY:        "destroy",
};

// ── State ─────────────────────────────────────

const listeners = new Map(); // event → Set of { fn, once }

// ── Public API ────────────────────────────────

/**
 * Register an event listener.
 * @param {string}   event    — NovixoEvent constant or custom string
 * @param {Function} handler  — called when event fires
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add({ fn: handler, once: false });
}

/**
 * Register a one-time event listener.
 * Automatically removed after first fire.
 * @param {string}   event
 * @param {Function} handler
 */
export function once(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add({ fn: handler, once: true });
}

/**
 * Remove an event listener.
 * @param {string}   event
 * @param {Function} handler — must be same function reference as used in on()
 */
export function off(event, handler) {
  const set = listeners.get(event);
  if (!set) return;
  for (const entry of set) {
    if (entry.fn === handler) { set.delete(entry); break; }
  }
}

/**
 * Remove ALL listeners for an event (or all events if no event given).
 * @param {string} [event]
 */
export function offAll(event) {
  if (event) { listeners.delete(event); }
  else       { listeners.clear(); }
}

/**
 * Emit an event — calls all registered handlers.
 * Called internally by core.js at every key moment.
 * @param {string} event
 * @param {...any}  args  — passed to each handler
 */
export function emit(event, ...args) {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;

  for (const entry of [...set]) {
    try {
      entry.fn(...args);
    } catch (e) {
      console.error(`[NovixoEngine:Events] Handler error for "${event}":`, e);
    }
    if (entry.once) set.delete(entry);
  }
}

/**
 * Get registered event names (for debugging).
 * @returns {string[]}
 */
export function getRegisteredEvents() {
  return Array.from(listeners.keys());
}

/**
 * Get listener count for an event.
 * @param {string} event
 * @returns {number}
 */
export function listenerCount(event) {
  return listeners.get(event)?.size ?? 0;
}
