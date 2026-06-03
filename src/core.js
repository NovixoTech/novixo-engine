/**
 * core.js — Novixo Sync (Phase 1.4)
 * ─────────────────────────────────────
 * Brain of Novixo Sync.
 * Updated for Phase 1.4: all queue/storage calls are now properly awaited.
 * Logic is identical to Phase 1.3.
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

import { isStorageAvailable, initStorage } from "./storage.js";

// ─────────────────────────────────────────────
// Configuration defaults
// ─────────────────────────────────────────────
const DEFAULT_CONFIG = {
  retryLimit: 5,        // Max retries per item before giving up
  retryDelay: 3000,     // ms between retry sweeps
  autoSync: true,       // Auto-sync when back online
  platform: null,       // "web" | "mobile" | null (auto-detect)
  onSyncSuccess: null,  // Callback: (item) => {}
  onSyncFailure: null,  // Callback: (item, error) => {}
  onQueueChange: null,  // Callback: (queueSize) => {}
  syncHandler: null,    // REQUIRED: async (item) => true/false
};

let config = { ...DEFAULT_CONFIG };
let retryTimer = null;
let initialized = false;

// ─────────────────────────────────────────────
// PUBLIC: Initialize the SDK
// ─────────────────────────────────────────────

/**
 * Initialize Novixo Sync
 * @param {Object} userConfig
 */
export async function init(userConfig = {}) {
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

  // Boot the correct storage adapter (web = IndexedDB, mobile = AsyncStorage)
  await initStorage(config.platform);

  // Check storage availability
  const storageOk = await isStorageAvailable();
  if (!storageOk) {
    console.warn("[NovixoSync] Storage not available. Queue won't persist across sessions.");
  } else {
    console.log("[NovixoSync] Storage ready ✓");
  }

  // Load any items queued from a previous session
  await loadQueue();

  // Start watching network status
  startNetworkMonitor();

  // When we come back online → auto-sync the queue
  if (config.autoSync) {
    onNetworkChange("online", async () => {
      console.log("[NovixoSync] Back online — starting sync sweep.");
      await resetFailed(); // Allow previously-failed items to retry
      startRetrySweep();
    });
  }

  initialized = true;
  console.log("[NovixoSync] Core initialized. Queue size:", queueSize());
}

// ─────────────────────────────────────────────
// PUBLIC: Queue data to be sent
// ─────────────────────────────────────────────

/**
 * Queue data for sending.
 * → If online:  attempts immediate send
 * → If offline: stores in IndexedDB queue for later
 *
 * @param {Object} data - { type, payload }
 * @returns {Promise<string>} item ID
 */
export async function send(data) {
  const id = await addToQueue(data);
  notifyQueueChange();

  if (isOnline() && config.syncHandler) {
    await trySyncItem({ id, ...data, retries: 0, status: "pending" });
  } else {
    console.log(`[NovixoSync] Offline — item [${id}] stored in IndexedDB queue.`);
  }

  return id;
}

// ─────────────────────────────────────────────
// PUBLIC: Manually trigger a sync
// ─────────────────────────────────────────────

/**
 * Sync all pending queue items immediately
 * @returns {Promise<void>}
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

// ─────────────────────────────────────────────
// INTERNAL: Try to sync one item via syncHandler
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  try {
    const success = await config.syncHandler(item);

    if (success) {
      await markSynced(item.id);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);
      console.log(`[NovixoSync] Item [${item.id}] synced ✓`);
    } else {
      throw new Error("syncHandler returned false");
    }
  } catch (err) {
    await markFailed(item.id);
    notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);
    console.warn(`[NovixoSync] Item [${item.id}] failed:`, err.message);
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Retry sweep (runs while online)
// ─────────────────────────────────────────────

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

function stopRetrySweep() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Notify developer of queue changes
// ─────────────────────────────────────────────

function notifyQueueChange() {
  if (config.onQueueChange) {
    config.onQueueChange(queueSize());
  }
}

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroy() {
  stopRetrySweep();
  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoSync] Core destroyed.");
  }
