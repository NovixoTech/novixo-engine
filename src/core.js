/**
 * core.js — Novixo Sync
 * The brain of Novixo Sync.
 * Decides: what to store | what to send | when to retry
 */

import {
  addToQueue,
  getPendingItems,
  markSynced,
  markFailed,
  resetFailed,
  loadQueue,
  queueSize,
} from "./queue.js";

import {
  isOnline,
  startNetworkMonitor,
  onNetworkChange,
} from "./network.js";

import { isStorageAvailable } from "./storage.js";

// Configuration defaults
const DEFAULT_CONFIG = {
  retryLimit: 5,           // Max retries per item before giving up
  retryDelay: 3000,        // ms between retry sweeps
  autoSync: true,          // Auto-sync when back online
  onSyncSuccess: null,     // Callback: (item) => {}
  onSyncFailure: null,     // Callback: (item, error) => {}
  onQueueChange: null,     // Callback: (queueSize) => {}
  syncHandler: null,       // Required: async (item) => true/false
};

let config = { ...DEFAULT_CONFIG };
let retryTimer = null;
let initialized = false;

/**
 * Initialize Novixo Sync core
 * @param {Object} userConfig
 */
export function init(userConfig = {}) {
  if (initialized) {
    console.warn("[NovixoSync] Already initialized.");
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  if (!config.syncHandler) {
    console.error(
      "[NovixoSync] No syncHandler provided. Pass { syncHandler: async (item) => bool } to init()."
    );
  }

  if (!isStorageAvailable()) {
    console.warn("[NovixoSync] localStorage not available. Queue won't persist across sessions.");
  }

  // Load any items queued from a previous session
  loadQueue();

  // Start watching network status
  startNetworkMonitor();

  // When we come back online, auto-sync the queue
  if (config.autoSync) {
    onNetworkChange("online", () => {
      console.log("[NovixoSync] Back online — starting sync sweep.");
      resetFailed();       // Allow previously-failed items to retry
      startRetrySweep();
    });
  }

  initialized = true;
  console.log("[NovixoSync] Core initialized. Queue size:", queueSize());
}

/**
 * Queue data to be sent.
 * If online: try immediately. If offline: store for later.
 * @param {Object} data - { type, payload }
 * @returns {string} item ID
 */
export async function send(data) {
  const id = addToQueue(data);
  notifyQueueChange();

  if (isOnline() && config.syncHandler) {
    // Try to send immediately
    await trySyncItem({ id, ...data, retries: 0, status: "pending" });
  } else {
    console.log(`[NovixoSync] Offline — item [${id}] queued for later.`);
  }

  return id;
}

/**
 * Try to sync a single queue item via the developer's syncHandler
 * @param {Object} item
 */
async function trySyncItem(item) {
  try {
    const success = await config.syncHandler(item);

    if (success) {
      markSynced(item.id);
      notifyQueueChange();

      if (config.onSyncSuccess) config.onSyncSuccess(item);
      console.log(`[NovixoSync] Item [${item.id}] synced successfully.`);
    } else {
      throw new Error("syncHandler returned false");
    }
  } catch (err) {
    markFailed(item.id);
    notifyQueueChange();

    if (config.onSyncFailure) config.onSyncFailure(item, err);
    console.warn(`[NovixoSync] Item [${item.id}] failed to sync:`, err.message);
  }
}

/**
 * Attempt to sync all pending items in the queue
 */
export async function syncNow() {
  if (!isOnline()) {
    console.log("[NovixoSync] Cannot sync — offline.");
    return;
  }

  const pending = getPendingItems();

  if (pending.length === 0) {
    console.log("[NovixoSync] Nothing to sync.");
    return;
  }

  console.log(`[NovixoSync] Syncing ${pending.length} item(s)...`);

  for (const item of pending) {
    if (item.retries >= config.retryLimit) {
      console.warn(`[NovixoSync] Item [${item.id}] exceeded retry limit. Skipping.`);
      continue;
    }
    await trySyncItem(item);
  }
}

/**
 * Start the periodic retry sweep (runs while online, stops when queue is empty)
 */
function startRetrySweep() {
  if (retryTimer) return; // Already running

  retryTimer = setInterval(async () => {
    if (!isOnline() || getPendingItems().length === 0) {
      stopRetrySweep();
      return;
    }
    await syncNow();
  }, config.retryDelay);
}

/**
 * Stop the retry sweep
 */
function stopRetrySweep() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

/**
 * Notify developer of queue size changes
 */
function notifyQueueChange() {
  if (config.onQueueChange) {
    config.onQueueChange(queueSize());
  }
}

/**
 * Teardown — useful for testing or cleanup
 */
export function destroy() {
  stopRetrySweep();
  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoSync] Core destroyed.");
  }
