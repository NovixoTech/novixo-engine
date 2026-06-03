/**
 * index.js — Novixo Sync SDK
 * Public entry point. This is what developers import.
 *
 * Usage:
 *   import Novixo from "novixo-sync";
 *
 *   Novixo.init({
 *     syncHandler: async (item) => {
 *       const res = await fetch("/api/sync", {
 *         method: "POST",
 *         body: JSON.stringify(item),
 *       });
 *       return res.ok;
 *     },
 *     onSyncSuccess: (item) => console.log("Sent:", item),
 *     onQueueChange: (size) => console.log("Queue size:", size),
 *   });
 *
 *   await Novixo.send({ type: "message", payload: { text: "Hello!" } });
 *   await Novixo.syncNow();
 */

import { init, send, syncNow, destroy } from "./src/core.js";
import { getQueue, clearQueue, queueSize } from "./src/queue.js";
import { isOnline } from "./src/network.js";

const Novixo = {
  /**
   * Initialize the SDK
   * @param {Object} config
   * @param {Function} config.syncHandler - async (item) => boolean
   * @param {number}   config.retryLimit  - default: 5
   * @param {number}   config.retryDelay  - ms, default: 3000
   * @param {boolean}  config.autoSync    - default: true
   * @param {Function} config.onSyncSuccess
   * @param {Function} config.onSyncFailure
   * @param {Function} config.onQueueChange
   */
  init,

  /**
   * Queue data for sending.
   * Sends immediately if online; queues if offline.
   * @param {Object} data - { type, payload }
   * @returns {Promise<string>} item ID
   */
  send,

  /**
   * Manually trigger a sync of all pending queue items
   * @returns {Promise<void>}
   */
  syncNow,

  /**
   * Get current network status
   * @returns {boolean}
   */
  isOnline,

  /**
   * Get all items currently in the queue
   * @returns {Array}
   */
  getQueue,

  /**
   * Get current queue size
   * @returns {number}
   */
  queueSize,

  /**
   * Clear the entire queue (use with care)
   */
  clearQueue,

  /**
   * Teardown the SDK (useful for testing)
   */
  destroy,
};

export default Novixo;
