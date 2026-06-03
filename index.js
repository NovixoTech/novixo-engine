/**
 * index.js — Novixo Sync SDK (Phase 3)
 * ──────────────────────────────────────
 * Public entry point.
 *
 * Usage:
 *   import Novixo, { ConflictStrategy } from "novixo-sync";
 *
 *   await Novixo.init({
 *     conflictStrategy: ConflictStrategy.CLIENT_WINS,
 *
 *     syncHandler: async (item) => {
 *       const res = await fetch("/api/sync", {
 *         method: "POST",
 *         body: JSON.stringify(item),
 *       });
 *
 *       // If server detected a conflict, return the conflict object
 *       if (res.status === 409) {
 *         const serverItem = await res.json();
 *         return { conflict: true, serverItem };
 *       }
 *
 *       return res.ok;
 *     },
 *
 *     onConflictResolved: (resolvedItem, strategy) => {
 *       console.log(`Conflict resolved via ${strategy}:`, resolvedItem);
 *     },
 *   });
 */

import { init, send, syncNow, destroy } from "./src/core.js";
import { getQueue, clearQueue, queueSize } from "./src/queue.js";
import { isOnline } from "./src/network.js";
export { ConflictStrategy } from "./src/conflict.js";

const Novixo = {
  /**
   * Initialize the SDK
   * @param {Object} config
   * @param {Function} config.syncHandler        - async (item) => true | false | { conflict, serverItem }
   * @param {string}   config.conflictStrategy   - ConflictStrategy.LAST_WRITE_WINS (default)
   * @param {Function} config.onConflict         - required if strategy = MANUAL
   * @param {Function} config.onConflictResolved - (resolvedItem, strategy) => {}
   * @param {string}   config.platform           - "web" | "mobile" | null
   * @param {number}   config.retryLimit         - default: 5
   * @param {number}   config.retryDelay         - ms, default: 3000
   * @param {boolean}  config.autoSync           - default: true
   * @param {Function} config.onSyncSuccess
   * @param {Function} config.onSyncFailure
   * @param {Function} config.onQueueChange
   */
  init,

  /** Queue data for sending (immediate if online, stored if offline) */
  send,

  /** Manually trigger a sync of all pending queue items */
  syncNow,

  /** Current network status */
  isOnline,

  /** All items currently in the queue */
  getQueue,

  /** Current queue size */
  queueSize,

  /** Clear the entire queue */
  clearQueue,

  /** Teardown the SDK */
  destroy,
};

export default Novixo;
