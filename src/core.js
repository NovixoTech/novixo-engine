/**
 * core.js — Novixo Sync (Phase 3)
 * ─────────────────────────────────────
 * Brain of Novixo Sync.
 * Phase 3 adds: conflict detection + resolution inside trySyncItem.
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

import {
  resolveConflict,
  isConflict,
  ConflictStrategy,
} from "./conflict.js";

// ─────────────────────────────────────────────
// Configuration defaults
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  retryLimit: 5,                              // Max retries per item
  retryDelay: 3000,                           // ms between retry sweeps
  autoSync: true,                             // Auto-sync on reconnect
  platform: null,                             // "web" | "mobile" | null

  // ── Conflict Resolution (Phase 3) ──
  conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
  onConflict: null,  // Required if strategy = MANUAL
                     // async (clientItem, serverItem) => resolvedItem
  onConflictResolved: null, // Callback: (resolvedItem, strategy) => {}

  // ── Callbacks ──
  onSyncSuccess: null,   // (item) => {}
  onSyncFailure: null,   // (item, error) => {}
  onQueueChange: null,   // (queueSize) => {}
  syncHandler: null,     // REQUIRED: async (item) => true | false | { conflict, serverItem }
};

let config = { ...DEFAULT_CONFIG };
let retryTimer = null;
let initialized = false;

// ─────────────────────────────────────────────
// PUBLIC: Initialize
// ─────────────────────────────────────────────

export async function init(userConfig = {}) {
  if (initialized) {
    console.warn("[NovixoSync] Already initialized.");
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  if (!config.syncHandler) {
    console.error("[NovixoSync] No syncHandler provided.");
  }

  // Boot storage adapter
  await initStorage(config.platform);

  const storageOk = await isStorageAvailable();
  if (!storageOk) {
    console.warn("[NovixoSync] Storage not available. Queue won't persist.");
  } else {
    console.log("[NovixoSync] Storage ready ✓");
  }

  // Load persisted queue
  await loadQueue();

  // Start network monitor
  startNetworkMonitor();

  // Auto-sync on reconnect
  if (config.autoSync) {
    onNetworkChange("online", async () => {
      console.log("[NovixoSync] Back online — starting sync sweep.");
      await resetFailed();
      startRetrySweep();
    });
  }

  initialized = true;
  console.log(
    `[NovixoSync] Core initialized ✓ | Strategy: ${config.conflictStrategy} | Queue: ${queueSize()}`
  );
}

// ─────────────────────────────────────────────
// PUBLIC: Send / queue an item
// ─────────────────────────────────────────────

export async function send(data) {
  const id = await addToQueue(data);
  notifyQueueChange();

  if (isOnline() && config.syncHandler) {
    await trySyncItem({ id, ...data, retries: 0, status: "pending" });
  } else {
    console.log(`[NovixoSync] Offline — item [${id}] queued.`);
  }

  return id;
}

// ─────────────────────────────────────────────
// PUBLIC: Manual sync trigger
// ─────────────────────────────────────────────

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
// INTERNAL: Try to sync one item
// Phase 3: now handles conflict responses
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  try {
    // Call the developer's sync function
    // It can return:
    //   true                              → success
    //   false                             → failure, retry later
    //   { conflict: true, serverItem: {} } → conflict detected
    const response = await config.syncHandler(item);

    // ── CONFLICT DETECTED ──
    if (isConflict(response)) {
      console.log(`[NovixoSync] Conflict detected for item [${item.id}]`);

      const resolved = await resolveConflict(
        item,
        response.serverItem,
        config.conflictStrategy,
        config.onConflict
      );

      // Notify developer of resolution
      if (config.onConflictResolved) {
        config.onConflictResolved(resolved, config.conflictStrategy);
      }

      // Mark original as synced — the resolved version is the truth now
      await markSynced(item.id);
      notifyQueueChange();

      // If client won, re-queue the resolved item for a final push to server
      if (resolved.id === item.id) {
        console.log(`[NovixoSync] Client version won — re-queuing resolved item [${item.id}]`);
        await addToQueue({ ...resolved, id: undefined }); // New ID, fresh queue entry
        notifyQueueChange();
      } else {
        // Server won — nothing more to push
        console.log(`[NovixoSync] Server version accepted for item [${item.id}]`);
      }

      return;
    }

    // ── SUCCESS ──
    if (response === true) {
      await markSynced(item.id);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);
      console.log(`[NovixoSync] Item [${item.id}] synced ✓`);
      return;
    }

    // ── FAILURE (returned false) ──
    throw new Error("syncHandler returned false");

  } catch (err) {
    await markFailed(item.id);
    notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);
    console.warn(`[NovixoSync] Item [${item.id}] failed:`, err.message);
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Retry sweep
// ─────────────────────────────────────────────

function startRetrySweep() {
  if (retryTimer) return;

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
  if (config.onQueueChange) config.onQueueChange(queueSize());
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
