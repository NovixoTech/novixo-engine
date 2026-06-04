/**
 * core.js — Novixo Engine (Phase 5c)
 * ──────────────────────────────────────────────────────
 * Phase 5c adds: Network Flap Protection via FlapGuard.
 * Auto-sync on reconnect now waits for genuine stability
 * before firing — preventing retry storms on flapping networks.
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
  startNetworkMonitor,
  onStateChange,
  getNetworkState,
  NetworkState,
  isOffline,
} from "./network.js";

import { isStorageAvailable, initStorage }         from "./storage.js";
import { resolveConflict, isConflict, ConflictStrategy } from "./conflict.js";
import { withPriority, Priority, describePriority }      from "./priority-queue.js";
import { createBatches, getHeldBackIds, describeBatchPlan } from "./batcher.js";
import { initTimeline, record, TimelineEvent, LogLevel }    from "./timeline.js";
import {
  initDedupe,
  checkAndRegister,
  releaseFingerprint,
  clearFingerprints,
  DedupeStrategy,
} from "./deduplication.js";
import {
  initFlapGuard,
  guardedOnline,
  guardedOffline,
  getFlapStats,
  destroyFlapGuard,
} from "./flap-guard.js";

// ─────────────────────────────────────────────
// Configuration defaults
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  platform:      null,
  autoSync:      true,

  retryLimit:  5,
  retryDelay: {
    [NetworkState.STABLE]:   2000,
    [NetworkState.DEGRADED]: 5000,
    [NetworkState.UNSTABLE]: 10000,
    [NetworkState.OFFLINE]:  0,
  },

  defaultPriority: Priority.MEDIUM,
  batchConfig:     {},
  qualityConfig:   {},

  // Conflict resolution (Phase 3)
  conflictStrategy:   ConflictStrategy.LAST_WRITE_WINS,
  onConflict:         null,
  onConflictResolved: null,

  // Timeline (Phase 5a)
  timeline:        true,
  timelineOptions: {},

  // Deduplication (Phase 5b)
  dedupe:        true,
  dedupeOptions: {
    strategy: DedupeStrategy.STRICT,
    windowMs: 5000,
    keyFn:    null,
  },
  onDuplicate: null,

  // Flap Guard (Phase 5c)
  flapGuard:        true,          // Enable/disable
  flapGuardOptions: {
    stabilityMs: 3000,             // Wait 3s of stable network before syncing
    maxFlaps:    10,
  },
  onFlap:   null,                  // (flapCount, history) => {}
  onStable: null,                  // () => {} — fires when network truly stable

  // Callbacks
  onSyncSuccess:         null,
  onSyncFailure:         null,
  onQueueChange:         null,
  onNetworkStateChange:  null,

  // Required
  syncHandler:      null,
  batchSyncHandler: null,
};

let config      = { ...DEFAULT_CONFIG };
let retryTimer  = null;
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

  // Init timeline
  if (config.timeline) {
    initTimeline(config.timelineOptions);
  }

  // Init deduplication
  if (config.dedupe) {
    initDedupe(config.dedupeOptions);
  }

  // Init flap guard
  if (config.flapGuard) {
    initFlapGuard({
      ...config.flapGuardOptions,
      onFlap:   config.onFlap,
      onStable: config.onStable,
    });
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

  // ── React to network state changes ──
  // Phase 5c: online events are now routed through FlapGuard
  onStateChange(async (newState, oldState) => {
    if (config.timeline) {
      record(
        TimelineEvent.NETWORK_CHANGED,
        `Network: ${oldState} → ${newState}`,
        newState === NetworkState.OFFLINE ? LogLevel.WARN : LogLevel.INFO,
        { newState, oldState }
      );
    }

    if (config.onNetworkStateChange) config.onNetworkStateChange(newState, oldState);

    if (!config.autoSync) return;

    const isComingOnline =
      newState === NetworkState.STABLE || newState === NetworkState.DEGRADED;

    const isGoingOffline =
      newState === NetworkState.OFFLINE || newState === NetworkState.UNSTABLE;

    if (isComingOnline) {
      if (config.flapGuard) {
        // Route through flap guard — only sync after stability window
        guardedOnline(async () => {
          if (config.timeline) {
            record(
              TimelineEvent.NETWORK_CHANGED,
              `Network stable — starting sync sweep`,
              LogLevel.INFO,
              { networkState: newState, flapStats: getFlapStats() }
            );
          }
          await resetFailed();
          startRetrySweep();
        }, newState);
      } else {
        // No flap guard — sync immediately (old behaviour)
        await resetFailed();
        startRetrySweep();
      }
    }

    if (isGoingOffline) {
      // Tell flap guard the network dropped — may cancel pending stability timer
      if (config.flapGuard) {
        guardedOffline(newState);
      }
      stopRetrySweep();
    }
  });

  initialized = true;

  if (config.timeline) {
    record(
      TimelineEvent.ENGINE_INIT,
      `Engine initialized | queue: ${queueSize()} | dedupe: ${config.dedupe} | flapGuard: ${config.flapGuard}`,
      LogLevel.INFO,
      {
        platform:   config.platform,
        queueSize:  queueSize(),
        dedupe:     config.dedupe,
        flapGuard:  config.flapGuard,
      }
    );
  }

  console.log(
    `[NovixoEngine] Initialized ✓ | Queue: ${queueSize()} | Dedupe: ${config.dedupe} | FlapGuard: ${config.flapGuard}`
  );
}

// ─────────────────────────────────────────────
// PUBLIC: Send
// ─────────────────────────────────────────────

export async function send(data, priority = config.defaultPriority) {
  const enriched = withPriority(data, priority);
  const tempItem = { ...enriched, id: `temp_${Date.now()}` };

  // Deduplication check
  if (config.dedupe) {
    const { isDuplicate, originalId, fingerprint } = checkAndRegister(tempItem);
    if (isDuplicate) {
      if (config.timeline) {
        record(
          TimelineEvent.ITEM_SKIPPED,
          `Duplicate dropped — matches [${originalId}]`,
          LogLevel.WARN,
          { originalId, fingerprint, type: data.type, priority }
        );
      }
      if (config.onDuplicate) config.onDuplicate(tempItem, originalId);
      return originalId;
    }
    releaseFingerprintByKey(fingerprint);
  }

  const id = await addToQueue(enriched);
  notifyQueueChange();

  if (config.dedupe) {
    checkAndRegister({ ...enriched, id });
  }

  const state = getNetworkState();

  if (config.timeline) {
    record(
      TimelineEvent.ITEM_QUEUED,
      `Item queued — ${describePriority(priority)} — network: ${state}`,
      LogLevel.INFO,
      { itemId: id, priority, type: data.type, networkState: state }
    );
  }

  if (state === NetworkState.OFFLINE) return id;

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
      record(TimelineEvent.SYNC_STARTED, "Sync aborted — offline", LogLevel.WARN, { networkState: state });
    }
    return;
  }

  const pending = getPendingItems();
  if (pending.length === 0) return;

  if (config.timeline) {
    record(
      TimelineEvent.SYNC_STARTED,
      `Sync started — ${pending.length} item(s) — network: ${state}`,
      LogLevel.INFO,
      { count: pending.length, networkState: state }
    );
  }

  const batches  = createBatches(pending, state, config.batchConfig);
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
    record(TimelineEvent.SYNC_COMPLETE, "Sync complete", LogLevel.SUCCESS, { networkState: state });
  }
}

// ─────────────────────────────────────────────
// PUBLIC: Get flap stats (exposes FlapGuard data)
// ─────────────────────────────────────────────

export function getFlapStats_() {
  return getFlapStats();
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
          releaseFingerprint(item.id);
          if (config.onSyncSuccess) config.onSyncSuccess(item);
          if (config.timeline) {
            record(TimelineEvent.ITEM_SYNCED, "Batch item synced", LogLevel.SUCCESS, { itemId: item.id });
          }
        } else {
          await markFailed(item.id);
          if (config.onSyncFailure) config.onSyncFailure(item, new Error("Batch item failed"));
          if (config.timeline) {
            record(TimelineEvent.ITEM_FAILED, "Batch item failed", LogLevel.ERROR, { itemId: item.id });
          }
        }
      });
      notifyQueueChange();
    } catch (err) {
      for (const item of batch) {
        await markFailed(item.id);
        if (config.onSyncFailure) config.onSyncFailure(item, err);
        if (config.timeline) {
          record(TimelineEvent.ITEM_FAILED, `Batch threw: ${err.message}`, LogLevel.ERROR, { itemId: item.id });
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
          `Retry limit (${config.retryLimit}) reached`,
          LogLevel.ERROR,
          { itemId: item.id, retries: item.retries }
        );
      }
      continue;
    }
    await trySyncItem(item);
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Try to sync one item
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  if (item.retries > 0 && config.timeline) {
    record(TimelineEvent.ITEM_RETRY, `Retry attempt ${item.retries}`, LogLevel.WARN, {
      itemId: item.id, retries: item.retries,
    });
  }

  try {
    const response = await config.syncHandler(item);

    if (isConflict(response)) {
      if (config.timeline) {
        record(TimelineEvent.CONFLICT_DETECTED, `Conflict — resolving via ${config.conflictStrategy}`, LogLevel.WARN, {
          itemId: item.id, strategy: config.conflictStrategy,
        });
      }
      const resolved = await resolveConflict(item, response.serverItem, config.conflictStrategy, config.onConflict);
      if (config.onConflictResolved) config.onConflictResolved(resolved, config.conflictStrategy);
      if (config.timeline) {
        record(TimelineEvent.CONFLICT_RESOLVED, `Resolved — ${resolved.id === item.id ? "client" : "server"} wins`, LogLevel.INFO, {
          itemId: item.id, winner: resolved.id === item.id ? "client" : "server",
        });
      }
      await markSynced(item.id);
      releaseFingerprint(item.id);
      notifyQueueChange();
      if (resolved.id === item.id) {
        await addToQueue({ ...resolved, id: undefined });
        notifyQueueChange();
      }
      return;
    }

    if (response === true) {
      await markSynced(item.id);
      releaseFingerprint(item.id);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);
      if (config.timeline) {
        record(TimelineEvent.ITEM_SYNCED, `Synced — ${describePriority(item.priority)}`, LogLevel.SUCCESS, {
          itemId: item.id, priority: item.priority, type: item.type,
        });
      }
      return;
    }

    throw new Error("syncHandler returned false");

  } catch (err) {
    await markFailed(item.id);
    notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);
    if (config.timeline) {
      record(TimelineEvent.ITEM_FAILED, `Failed — ${err.message}`, LogLevel.ERROR, {
        itemId: item.id, error: err.message,
      });
    }
  }
}

// ─────────────────────────────────────────────
// INTERNAL helpers
// ─────────────────────────────────────────────

function releaseFingerprintByKey(_fingerprint) {
  // no-op shim — real release handled in deduplication module
}

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

function notifyQueueChange() {
  if (config.onQueueChange) config.onQueueChange(queueSize());
}

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroy() {
  stopRetrySweep();
  clearFingerprints();
  destroyFlapGuard();

  if (config.timeline) {
    record(TimelineEvent.ENGINE_DESTROYED, "Engine destroyed", LogLevel.INFO);
  }

  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoEngine] Destroyed.");
      }
