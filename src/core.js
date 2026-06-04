/**
 * core.js — Novixo Engine (Phase 5a)
 * ──────────────────────────────────────────────────────
 * Phase 5a adds: Sync Timeline integrated at every key moment.
 * Every queue, sync, retry, conflict, and network event is now recorded.
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
  onStateChange,
  getNetworkState,
  NetworkState,
  isStable,
  isDegraded,
  isUnstable,
  isOffline,
} from "./network.js";

import { isStorageAvailable, initStorage } from "./storage.js";

import {
  resolveConflict,
  isConflict,
  ConflictStrategy,
} from "./conflict.js";

import {
  withPriority,
  sortByPriority,
  Priority,
  describePriority,
} from "./priority-queue.js";

import {
  createBatches,
  getHeldBackIds,
  describeBatchPlan,
} from "./batcher.js";

import {
  initTimeline,
  record,
  TimelineEvent,
  LogLevel,
} from "./timeline.js";

// ─────────────────────────────────────────────
// Configuration defaults
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  platform: null,
  autoSync: true,

  retryLimit: 5,
  retryDelay: {
    [NetworkState.STABLE]:   2000,
    [NetworkState.DEGRADED]: 5000,
    [NetworkState.UNSTABLE]: 10000,
    [NetworkState.OFFLINE]:  0,
  },

  defaultPriority: Priority.MEDIUM,
  batchConfig: {},
  qualityConfig: {},

  // Conflict resolution
  conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
  onConflict: null,
  onConflictResolved: null,

  // Timeline (Phase 5a)
  timeline: true,          // Enable/disable timeline logging
  timelineOptions: {},     // { maxEntries, onEntry }

  // Callbacks
  onSyncSuccess: null,
  onSyncFailure: null,
  onQueueChange: null,
  onNetworkStateChange: null,

  // Required
  syncHandler: null,
  batchSyncHandler: null,
};

let config = { ...DEFAULT_CONFIG };
let retryTimer = null;
let initialized = false;

// ─────────────────────────────────────────────
// PUBLIC: Initialize
// ─────────────────────────────────────────────

export async function init(userConfig = {}) {
  if (initialized) {
    console.warn("[NovixoEngine] Already initialized.");
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  if (!config.syncHandler) {
    console.error("[NovixoEngine] No syncHandler provided.");
  }

  // Init timeline first — so we can log everything from here
  if (config.timeline) {
    initTimeline(config.timelineOptions);
  }

  // Boot storage
  await initStorage(config.platform);
  const storageOk = await isStorageAvailable();

  if (!storageOk) {
    console.warn("[NovixoEngine] Storage unavailable.");
  }

  // Load persisted queue
  await loadQueue();

  // Start network monitor
  startNetworkMonitor(config.qualityConfig);

  // React to network state changes
  onStateChange(async (newState, oldState) => {
    if (config.timeline) {
      record(
        TimelineEvent.NETWORK_CHANGED,
        `Network: ${oldState} → ${newState}`,
        newState === NetworkState.OFFLINE ? LogLevel.WARN : LogLevel.INFO,
        { newState, oldState }
      );
    }

    if (config.onNetworkStateChange) {
      config.onNetworkStateChange(newState, oldState);
    }

    if (config.autoSync) {
      if (
        newState === NetworkState.STABLE ||
        newState === NetworkState.DEGRADED
      ) {
        await resetFailed();
        startRetrySweep();
      }
      if (newState === NetworkState.OFFLINE) {
        stopRetrySweep();
      }
    }
  });
  initialized = true;

  if (config.timeline) {
    record(
      TimelineEvent.ENGINE_INIT,
      `Engine initialized | platform: ${config.platform ?? "auto"} | queue: ${queueSize()} item(s)`,
      LogLevel.INFO,
      {
        platform: config.platform,
        conflictStrategy: config.conflictStrategy,
        queueSize: queueSize(),
      }
    );
  }

  console.log(
    `[NovixoEngine] Initialized ✓ | Strategy: ${config.conflictStrategy} | Queue: ${queueSize()}`
  );
}

// ─────────────────────────────────────────────
// PUBLIC: Send
// ─────────────────────────────────────────────

export async function send(data, priority = config.defaultPriority) {
  const enriched = withPriority(data, priority);
  const id = await addToQueue(enriched);
  notifyQueueChange();

  const state = getNetworkState();

  if (config.timeline) {
    record(
      TimelineEvent.ITEM_QUEUED,
      `Item queued — ${describePriority(priority)} — network: ${state}`,
      LogLevel.INFO,
      { itemId: id, priority, type: data.type, networkState: state }
    );
  }

  if (state === NetworkState.OFFLINE) {
    return id;
  }

  if (state === NetworkState.UNSTABLE && priority !== Priority.HIGH) {
    if (config.timeline) {
      record(
        TimelineEvent.ITEM_SKIPPED,
        `Item held — UNSTABLE network, not HIGH priority`,
        LogLevel.WARN,
        { itemId: id, priority, networkState: state }
      );
    }
    return id;
  }

  await trySyncItem({ id, ...enriched, retries: 0, status: "pending" });
  return id;
}

// ─────────────────────────────────────────────
// PUBLIC: Manual sync
// ─────────────────────────────────────────────

export async function syncNow() {
  const state = getNetworkState();

  if (state === NetworkState.OFFLINE) {
    if (config.timeline) {
      record(
        TimelineEvent.SYNC_STARTED,
        "Sync attempted — offline, aborted",
        LogLevel.WARN,
        { networkState: state }
      );
    }
    return;
  }

  const pending = getPendingItems();
  if (pending.length === 0) return;

  if (config.timeline) {
    record(
      TimelineEvent.SYNC_STARTED,
      `Sync started — ${pending.length} item(s) pending — network: ${state}`,
      LogLevel.INFO,
      { count: pending.length, networkState: state }
    );
  }

  const batches = createBatches(pending, state, config.batchConfig);
  describeBatchPlan(batches, state);

  const heldBack = getHeldBackIds(pending, batches);
  if (heldBack.length > 0 && config.timeline) {
    record(
      TimelineEvent.ITEM_SKIPPED,
      `${heldBack.length} item(s) held — network too weak`,
      LogLevel.WARN,
      { heldBackIds: heldBack, networkState: state }
    );
  }

  if (config.batchSyncHandler && batches.length > 0) {
    await syncBatches(batches);
  } else {
    await syncItemByItem(batches);
  }

  if (config.timeline) {
    record(
      TimelineEvent.SYNC_COMPLETE,
      `Sync complete`,
      LogLevel.SUCCESS,
      { networkState: state }
    );
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Batch sync
// ─────────────────────────────────────────────

async function syncBatches(batches) {
  for (const batch of batches) {
    if (batch.length === 0) continue;

    try {
      const results = await config.batchSyncHandler(batch);

      batch.forEach(async (item, i) => {
        const success = Array.isArray(results) ? results[i] : results;
        if (success) {
          await markSynced(item.id);
          if (config.onSyncSuccess) config.onSyncSuccess(item);
          if (config.timeline) {
            record(
              TimelineEvent.ITEM_SYNCED,
              `Batch item synced`,
              LogLevel.SUCCESS,
              { itemId: item.id, priority: item.priority }
            );
          }
        } else {
          await markFailed(item.id);
          if (config.onSyncFailure) config.onSyncFailure(item, new Error("Batch item failed"));
          if (config.timeline) {
            record(
              TimelineEvent.ITEM_FAILED,
              `Batch item failed`,
              LogLevel.ERROR,
              { itemId: item.id, priority: item.priority }
            );
          }
        }
      });

      notifyQueueChange();
    } catch (err) {
      for (const item of batch) {
        await markFailed(item.id);
        if (config.onSyncFailure) config.onSyncFailure(item, err);
        if (config.timeline) {
          record(
            TimelineEvent.ITEM_FAILED,
            `Batch sync threw: ${err.message}`,
            LogLevel.ERROR,
            { itemId: item.id }
          );
        }
      }
      notifyQueueChange();
    }
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Item-by-item sync
// ─────────────────────────────────────────────

async function syncItemByItem(batches) {
  const items = batches.flat();

  for (const item of items) {
    if (item.retries >= config.retryLimit) {
      if (config.timeline) {
        record(
          TimelineEvent.ITEM_SKIPPED,
          `Retry limit reached (${config.retryLimit}) — item skipped`,
          LogLevel.ERROR,
          { itemId: item.id, retries: item.retries }
        );
      }
      console.warn(`[NovixoEngine] Item [${item.id}] exceeded retry limit.`);
      continue;
    }
    await trySyncItem(item);
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Try to sync one item
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  // Log retry if this isn't the first attempt
  if (item.retries > 0 && config.timeline) {
    record(
      TimelineEvent.ITEM_RETRY,
      `Retry attempt ${item.retries} for item`,
      LogLevel.WARN,
      { itemId: item.id, retries: item.retries, priority: item.priority }
    );
  }

  try {
    const response = await config.syncHandler(item);

    // ── CONFLICT ──
    if (isConflict(response)) {
      if (config.timeline) {
        record(
          TimelineEvent.CONFLICT_DETECTED,
          `Conflict detected — resolving via ${config.conflictStrategy}`,
          LogLevel.WARN,
          { itemId: item.id, strategy: config.conflictStrategy }
        );
      }

      const resolved = await resolveConflict(
        item,
        response.serverItem,
        config.conflictStrategy,
        config.onConflict
      );

      if (config.onConflictResolved) config.onConflictResolved(resolved, config.conflictStrategy);

      if (config.timeline) {
        record(
          TimelineEvent.CONFLICT_RESOLVED,
          `Conflict resolved — ${resolved.id === item.id ? "client" : "server"} version kept`,
          LogLevel.INFO,
          {
            itemId: item.id,
            winner: resolved.id === item.id ? "client" : "server",
            strategy: config.conflictStrategy,
          }
        );
      }

      await markSynced(item.id);
      notifyQueueChange();

      if (resolved.id === item.id) {
        await addToQueue({ ...resolved, id: undefined });
        notifyQueueChange();
      }
      return;
    }

    // ── SUCCESS ──
    if (response === true) {
      await markSynced(item.id);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);

      if (config.timeline) {
        record(
          TimelineEvent.ITEM_SYNCED,
          `Synced successfully — ${describePriority(item.priority)}`,
          LogLevel.SUCCESS,
          { itemId: item.id, priority: item.priority, type: item.type }
        );
      }
      return;
    }

    throw new Error("syncHandler returned false");

  } catch (err) {
    await markFailed(item.id);
    notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);

    if (config.timeline) {
      record(
        TimelineEvent.ITEM_FAILED,
        `Sync failed — ${err.message}`,
        LogLevel.ERROR,
        { itemId: item.id, priority: item.priority, error: err.message }
      );
    }
  }
  }
// ─────────────────────────────────────────────
// INTERNAL: Retry sweep (adaptive delay)
// ─────────────────────────────────────────────

function startRetrySweep() {
  if (retryTimer) return;

  const scheduleNext = async () => {
    if (isOffline()) { stopRetrySweep(); return; }
    if (getPendingItems().length > 0) await syncNow();

    const delay = config.retryDelay[getNetworkState()] ?? 5000;
    if (delay > 0 && getPendingItems().length > 0) {
      retryTimer = setTimeout(scheduleNext, delay);
    } else {
      retryTimer = null;
    }
  };

  const delay = config.retryDelay[getNetworkState()] ?? 5000;
  retryTimer = setTimeout(scheduleNext, delay);
}

function stopRetrySweep() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

// ─────────────────────────────────────────────
// INTERNAL: Queue change notification
// ─────────────────────────────────────────────

function notifyQueueChange() {
  if (config.onQueueChange) config.onQueueChange(queueSize());
}

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroy() {
  stopRetrySweep();

  if (config.timeline) {
    record(
      TimelineEvent.ENGINE_DESTROYED,
      "Engine destroyed",
      LogLevel.INFO
    );
  }

  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoEngine] Destroyed.");
}
