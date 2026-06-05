/**
 * optimistic.js — Novixo Engine (Phase 6e)
 * ──────────────────────────────────────────────
 * Optimistic UI Helper.
 *
 * THE PROBLEM:
 * User taps "Send Message". App waits for server response.
 * On bad network: user waits 3 seconds staring at a spinner.
 * On no network: user sees an error. They feel frustrated.
 *
 * THE SOLUTION — OPTIMISTIC UI:
 * Instead of waiting:
 *   1. Update the UI IMMEDIATELY as if it worked
 *   2. Queue the actual request in the background
 *   3. When server confirms → finalize silently
 *   4. If server fails → revert the UI + show real error
 *
 * This is how WhatsApp, iMessage, Twitter, and Gmail work.
 * The message appears instantly. The tick appears later.
 *
 * HOW TO USE:
 *   await Novixo.sendOptimistic(data, {
 *     onOptimistic: (tempId, data) => {
 *       // Update your UI immediately — show the item as "sent"
 *       addMessageToUI({ ...data, id: tempId, status: "sending" });
 *     },
 *     onConfirmed: (tempId, item) => {
 *       // Server confirmed — update status to "delivered"
 *       updateMessageStatus(tempId, "delivered");
 *     },
 *     onReverted: (tempId, error) => {
 *       // Failed — remove from UI or show error
 *       removeMessageFromUI(tempId);
 *       showError("Message failed to send");
 *     },
 *   });
 */

// ─────────────────────────────────────────────
// Dependencies injected by core.js
// ─────────────────────────────────────────────

let _sendFn    = null; // core.js send()
let _onSuccess = null; // wrapped success callback
let _onFailure = null; // wrapped failure callback

/**
 * Inject dependencies from core.js.
 * Called during init().
 */
export function injectOptimisticDeps(sendFn) {
  _sendFn = sendFn;
}

// ─────────────────────────────────────────────
// Pending optimistic items
// Map: tempId → { onConfirmed, onReverted }
// ─────────────────────────────────────────────

const pendingOptimistic = new Map();

// ─────────────────────────────────────────────
// PUBLIC: sendOptimistic
// ─────────────────────────────────────────────

/**
 * Send data with optimistic UI update.
 *
 * @param {Object}   data                   — { type, payload, ... }
 * @param {Object}   options
 * @param {Function} options.onOptimistic   — (tempId, data) => void — UPDATE UI NOW
 * @param {Function} options.onConfirmed    — (tempId, item) => void — server said OK
 * @param {Function} options.onReverted     — (tempId, error) => void — revert UI
 * @param {string}   options.priority       — Priority level
 * @returns {Promise<string>}               — tempId (use this in your UI)
 */
export async function sendOptimistic(data, options = {}) {
  const {
    onOptimistic,
    onConfirmed,
    onReverted,
    priority,
  } = options;

  if (!onOptimistic) {
    console.warn("[NovixoEngine:Optimistic] onOptimistic callback is required.");
  }

  // Generate a temp ID for immediate UI use
  const tempId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Store callbacks keyed by tempId
  pendingOptimistic.set(tempId, { onConfirmed, onReverted });

  // ── STEP 1: Update UI immediately ──
  if (onOptimistic) {
    try {
      onOptimistic(tempId, data);
    } catch (e) {
      console.error("[NovixoEngine:Optimistic] onOptimistic threw:", e);
    }
  }

  // ── STEP 2: Queue the real request ──
  if (!_sendFn) {
    console.error("[NovixoEngine:Optimistic] Not initialized. Call Novixo.init() first.");
    return tempId;
  }

  // Attach tempId to data so we can match it in callbacks
  const enrichedData = { ...data, _optimisticTempId: tempId };

  try {
    await _sendFn(enrichedData, priority);
  } catch (err) {
    // send() itself threw — revert immediately
    handleOptimisticFailure(tempId, err);
  }

  return tempId;
}

// ─────────────────────────────────────────────
// PUBLIC: Resolve optimistic item (called by core.js)
// ─────────────────────────────────────────────

/**
 * Called by core.js when a sync succeeds.
 * Fires onConfirmed for any optimistic item.
 * @param {Object} item — synced queue item
 */
export function resolveOptimistic(item) {
  const tempId = item?._optimisticTempId ?? item?.payload?._optimisticTempId;
  if (!tempId || !pendingOptimistic.has(tempId)) return;

  const { onConfirmed } = pendingOptimistic.get(tempId);
  pendingOptimistic.delete(tempId);

  if (onConfirmed) {
    try {
      onConfirmed(tempId, item);
    } catch (e) {
      console.error("[NovixoEngine:Optimistic] onConfirmed threw:", e);
    }
  }
}

/**
 * Called by core.js when a sync fails permanently.
 * Fires onReverted for any optimistic item.
 * @param {string} tempId
 * @param {Error}  error
 */
export function handleOptimisticFailure(tempId, error) {
  if (!tempId || !pendingOptimistic.has(tempId)) return;

  const { onReverted } = pendingOptimistic.get(tempId);
  pendingOptimistic.delete(tempId);

  if (onReverted) {
    try {
      onReverted(tempId, error);
    } catch (e) {
      console.error("[NovixoEngine:Optimistic] onReverted threw:", e);
    }
  }
}

/**
 * Clear all pending optimistic items (for teardown)
 */
export function clearOptimistic() {
  pendingOptimistic.clear();
}

/**
 * Get count of pending optimistic items
 * @returns {number}
 */
export function getPendingOptimisticCount() {
  return pendingOptimistic.size;
                                     }
