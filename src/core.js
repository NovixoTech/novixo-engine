/**
 * core.js — Novixo Engine (Phase 6) — COMPLETE ENGINE
 * ──────────────────────────────────────────────────────
 * All phases integrated:
 *   Phase 1–4:  Queue, network, storage, priority, batching, conflict
 *   Phase 5a:   Sync timeline
 *   Phase 5b:   Deduplication
 *   Phase 5c:   Flap guard
 *   Phase 5d:   Safe mode
 *   Phase 6b:   Exponential backoff
 *   Phase 6c:   Request timeout + auto-queue fallback
 *   Phase 6d:   Queue cancel / edit
 *   Phase 6e:   Optimistic UI
 */

import {
  addToQueue, getPendingItems, markSynced,
  markFailed, resetFailed, loadQueue, queueSize, getQueueRef,
} from "./queue.js";

import {
  startNetworkMonitor, onStateChange,
  getNetworkState, NetworkState, isOffline,
} from "./network.js";

import { isStorageAvailable, initStorage }               from "./storage.js";
import { resolveConflict, isConflict, ConflictStrategy } from "./conflict.js";
import { withPriority, Priority, describePriority }      from "./priority-queue.js";
import { createBatches, getHeldBackIds, describeBatchPlan } from "./batcher.js";
import { initTimeline, record, TimelineEvent, LogLevel }    from "./timeline.js";
import {
  initDedupe, checkAndRegister,
  releaseFingerprint, clearFingerprints, DedupeStrategy,
} from "./deduplication.js";
import {
  initFlapGuard, guardedOnline, guardedOffline,
  getFlapStats, destroyFlapGuard,
} from "./flap-guard.js";
import {
  initSafeMode, recordAttempt, isInSafeMode,
  getSafeModeState, getStats as getSafeModeStats,
  getRetryMultiplier, resetSafeMode,
} from "./safe-mode.js";
import {
  calculateNetworkAwareBackoff, createBackoffTracker,
} from "./backoff.js";
import {
  withTimeout, isTimeoutError, NovixoTimeoutError,
} from "./timeout.js";
import {
  injectQueueRef, cancelItem, updateItem, hasItem, getItem,
} from "./queue-manager.js";
import {
  injectOptimisticDeps, sendOptimistic,
  resolveOptimistic, handleOptimisticFailure, clearOptimistic,
} from "./optimistic.js";

// ─────────────────────────────────────────────
// Config defaults
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  platform: null, autoSync: true,

  retryLimit: 5,
  retryDelay: {
    [NetworkState.STABLE]:   2000,
    [NetworkState.DEGRADED]: 5000,
    [NetworkState.UNSTABLE]: 10000,
    [NetworkState.OFFLINE]:  0,
  },

  defaultPriority: Priority.MEDIUM,
  batchConfig: {}, qualityConfig: {},

  // Phase 3
  conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
  onConflict: null, onConflictResolved: null,

  // Phase 5a
  timeline: true, timelineOptions: {},

  // Phase 5b
  dedupe: true,
  dedupeOptions: { strategy: DedupeStrategy.STRICT, windowMs: 5000, keyFn: null },
  onDuplicate: null,

  // Phase 5c
  flapGuard: true,
  flapGuardOptions: { stabilityMs: 3000, maxFlaps: 10 },
  onFlap: null, onStable: null,

  // Phase 5d
  safeMode: true,
  safeModeOptions: { window: 10, enterThreshold: 0.6, exitThreshold: 0.3, retryMultiplier: 3 },
  onSafeMode: null, onSafeModeExit: null,

  // Phase 6b
  backoff: true,
  backoffOptions: { baseDelay: 1000, maxDelay: 30000, multiplier: 2, jitter: true },

  // Phase 6c
  timeout: true,
  timeoutMs: 10000,       // 10 seconds
  onTimeout: null,        // (item) => {}

  // Callbacks
  onSyncSuccess: null, onSyncFailure: null,
  onQueueChange: null, onNetworkStateChange: null,

  // Required
  syncHandler: null, batchSyncHandler: null,
};

let config      = { ...DEFAULT_CONFIG };
let retryTimer  = null;
let initialized = false;
let backoffTracker = null;

// ─────────────────────────────────────────────
// PUBLIC: Initialize
// ─────────────────────────────────────────────

export async function init(userConfig = {}) {
  if (initialized) { console.warn("[NovixoEngine] Already initialized."); return; }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  if (!config.syncHandler) console.error("[NovixoEngine] No syncHandler provided.");

  // Init subsystems
  if (config.timeline)  initTimeline(config.timelineOptions);
  if (config.dedupe)    initDedupe(config.dedupeOptions);
  if (config.flapGuard) initFlapGuard({ ...config.flapGuardOptions, onFlap: config.onFlap, onStable: config.onStable });
  if (config.safeMode)  initSafeMode({ ...config.safeModeOptions, onSafeMode: config.onSafeMode, onSafeModeExit: config.onSafeModeExit });
  if (config.backoff)   backoffTracker = createBackoffTracker(config.backoffOptions);

  // Init storage + queue
  await initStorage(config.platform);
  if (!(await isStorageAvailable())) console.warn("[NovixoEngine] Storage unavailable.");
  await loadQueue();

  // Phase 6d: inject queue ref for cancel/update
  injectQueueRef(getQueueRef());

  // Phase 6e: inject send into optimistic helper
  injectOptimisticDeps(send);

  // Network monitor
  startNetworkMonitor(config.qualityConfig);

  onStateChange(async (newState, oldState) => {
    if (config.timeline) {
      record(TimelineEvent.NETWORK_CHANGED, `Network: ${oldState} → ${newState}`,
        newState === NetworkState.OFFLINE ? LogLevel.WARN : LogLevel.INFO,
        { newState, oldState });
    }
    if (config.onNetworkStateChange) config.onNetworkStateChange(newState, oldState);
    if (!config.autoSync) return;

    const comingOnline = newState === NetworkState.STABLE || newState === NetworkState.DEGRADED;
    const goingOffline = newState === NetworkState.OFFLINE || newState === NetworkState.UNSTABLE;

    if (comingOnline) {
      const doSync = async () => {
        await resetFailed();
        if (backoffTracker) backoffTracker.resetAll(); // Reset backoff on reconnect
        startRetrySweep();
      };
      config.flapGuard ? guardedOnline(doSync, newState) : await doSync();
    }
    if (goingOffline) {
      if (config.flapGuard) guardedOffline(newState);
      stopRetrySweep();
    }
  });

  initialized = true;

  if (config.timeline) {
    record(TimelineEvent.ENGINE_INIT,
      `Engine ready | queue:${queueSize()} | backoff:${config.backoff} | timeout:${config.timeout}ms`,
      LogLevel.INFO,
      { platform: config.platform, queueSize: queueSize(), backoff: config.backoff, timeout: config.timeoutMs }
    );
  }

  console.log(`[NovixoEngine] ✓ Initialized | Queue:${queueSize()} | Backoff:${config.backoff} | Timeout:${config.timeoutMs}ms`);
}

// ─────────────────────────────────────────────
// PUBLIC: Send
// ─────────────────────────────────────────────

export async function send(data, priority = config.defaultPriority) {
  const enriched = withPriority(data, priority);
  const tempItem = { ...enriched, id: `temp_${Date.now()}` };

  // Deduplication
  if (config.dedupe) {
    const { isDuplicate, originalId, fingerprint } = checkAndRegister(tempItem);
    if (isDuplicate) {
      if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Duplicate dropped — matches [${originalId}]`, LogLevel.WARN, { originalId, type: data.type });
      if (config.onDuplicate) config.onDuplicate(tempItem, originalId);
      return originalId;
    }
    releaseFingerprint(tempItem.id);
  }

  const id = await addToQueue(enriched);
  notifyQueueChange();
  if (config.dedupe) checkAndRegister({ ...enriched, id });

  const state = getNetworkState();
  if (config.timeline) record(TimelineEvent.ITEM_QUEUED, `Queued — ${describePriority(priority)} — ${state}`, LogLevel.INFO, { itemId: id, priority, type: data.type, networkState: state });

  if (state === NetworkState.OFFLINE) return id;
  if (isInSafeMode() && priority !== Priority.HIGH) {
    if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Held — SAFE MODE`, LogLevel.WARN, { itemId: id, priority });
    return id;
  }
  if (state === NetworkState.UNSTABLE && priority !== Priority.HIGH) {
    if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Held — UNSTABLE`, LogLevel.WARN, { itemId: id, priority });
    return id;
  }

  await trySyncItem({ id, ...enriched, retries: 0, status: "pending" });
  return id;
}

// ─────────────────────────────────────────────
// PUBLIC: sendOptimistic (Phase 6e)
// ─────────────────────────────────────────────

export { sendOptimistic };

// ─────────────────────────────────────────────
// PUBLIC: cancelItem / updateItem (Phase 6d)
// ─────────────────────────────────────────────

export { cancelItem, updateItem, hasItem, getItem };

// ─────────────────────────────────────────────
// PUBLIC: syncNow
// ─────────────────────────────────────────────

export async function syncNow() {
  const state = getNetworkState();
  if (state === NetworkState.OFFLINE) return;

  let pending = getPendingItems();
  if (pending.length === 0) return;

  // Safe mode — HIGH only
  if (isInSafeMode()) {
    pending = pending.filter((i) => i.priority === Priority.HIGH);
    if (pending.length === 0) return;
  }

  if (config.timeline) {
    record(TimelineEvent.SYNC_STARTED, `Sync — ${pending.length} item(s) — ${state}${isInSafeMode() ? " [SAFE MODE]" : ""}`, LogLevel.INFO, { count: pending.length, networkState: state });
  }

  if (!isInSafeMode() && config.batchSyncHandler) {
    const batches = createBatches(pending, state, config.batchConfig);
    await syncBatches(batches);
  } else {
    for (const item of pending) {
      if (item.retries >= config.retryLimit) continue;
      await trySyncItem(item);
    }
  }

  if (config.timeline) record(TimelineEvent.SYNC_COMPLETE, "Sync complete", LogLevel.SUCCESS, { networkState: state });
}

// ─────────────────────────────────────────────
// INTERNAL: Try to sync one item
// Phase 6b: exponential backoff per item
// Phase 6c: timeout wrapper
// Phase 6e: optimistic resolution
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  if (item.retries > 0 && config.timeline) {
    record(TimelineEvent.ITEM_RETRY, `Retry ${item.retries}`, LogLevel.WARN, { itemId: item.id, retries: item.retries });
  }

  try {
    // Phase 6c: wrap with timeout
    const handlerToCall = config.timeout
      ? () => withTimeout(config.syncHandler, item, config.timeoutMs)
      : () => config.syncHandler(item);

    const response = await handlerToCall();

    // ── CONFLICT ──
    if (isConflict(response)) {
      if (config.safeMode) recordAttempt(false);
      if (config.timeline) record(TimelineEvent.CONFLICT_DETECTED, `Conflict — ${config.conflictStrategy}`, LogLevel.WARN, { itemId: item.id });
      const resolved = await resolveConflict(item, response.serverItem, config.conflictStrategy, config.onConflict);
      if (config.onConflictResolved) config.onConflictResolved(resolved, config.conflictStrategy);
      if (config.timeline) record(TimelineEvent.CONFLICT_RESOLVED, `Resolved — ${resolved.id === item.id ? "client" : "server"} wins`, LogLevel.INFO, { itemId: item.id });
      await markSynced(item.id);
      releaseFingerprint(item.id);
      if (backoffTracker) backoffTracker.reset(item.id);
      notifyQueueChange();
      if (resolved.id === item.id) { await addToQueue({ ...resolved, id: undefined }); notifyQueueChange(); }
      return;
    }

    // ── SUCCESS ──
    if (response === true) {
      if (config.safeMode) recordAttempt(true);
      await markSynced(item.id);
      releaseFingerprint(item.id);
      if (backoffTracker) backoffTracker.reset(item.id);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);
      resolveOptimistic(item); // Phase 6e
      if (config.timeline) record(TimelineEvent.ITEM_SYNCED, `Synced — ${describePriority(item.priority)}`, LogLevel.SUCCESS, { itemId: item.id, priority: item.priority });
      return;
    }

    throw new Error("syncHandler returned false");

  } catch (err) {
    if (config.safeMode) recordAttempt(false);
    if (backoffTracker) backoffTracker.recordFailure(item.id);

    // Phase 6c: timeout handling
    if (isTimeoutError(err)) {
      if (config.timeline) record(TimelineEvent.ITEM_FAILED, `Timeout after ${config.timeoutMs}ms — re-queued`, LogLevel.WARN, { itemId: item.id, timeout: true });
      if (config.onTimeout) config.onTimeout(item);
      // Item stays in queue as "failed" — retry sweep will pick it up
    } else {
      if (config.timeline) record(TimelineEvent.ITEM_FAILED, `Failed — ${err.message}`, LogLevel.ERROR, { itemId: item.id, error: err.message });
    }

    await markFailed(item.id);
    notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);

    // Phase 6e: revert optimistic UI on permanent failure
    const tempId = item?._optimisticTempId ?? item?.payload?._optimisticTempId;
    if (tempId && item.retries >= config.retryLimit) {
      handleOptimisticFailure(tempId, err);
    }
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Batch sync
// ─────────────────────────────────────────────

async function syncBatches(batches) {
  for (const batch of batches) {
    if (!batch.length) continue;
    try {
      const results = await config.batchSyncHandler(batch);
      batch.forEach(async (item, i) => {
        const success = Array.isArray(results) ? results[i] : results;
        if (config.safeMode) recordAttempt(success);
        if (success) {
          await markSynced(item.id); releaseFingerprint(item.id);
          if (backoffTracker) backoffTracker.reset(item.id);
          resolveOptimistic(item);
          if (config.onSyncSuccess) config.onSyncSuccess(item);
          if (config.timeline) record(TimelineEvent.ITEM_SYNCED, "Batch synced", LogLevel.SUCCESS, { itemId: item.id });
        } else {
          await markFailed(item.id);
          if (backoffTracker) backoffTracker.recordFailure(item.id);
          if (config.onSyncFailure) config.onSyncFailure(item, new Error("Batch failed"));
          if (config.timeline) record(TimelineEvent.ITEM_FAILED, "Batch failed", LogLevel.ERROR, { itemId: item.id });
        }
      });
      notifyQueueChange();
    } catch (err) {
      for (const item of batch) {
        if (config.safeMode) recordAttempt(false);
        if (backoffTracker) backoffTracker.recordFailure(item.id);
        await markFailed(item.id);
        if (config.onSyncFailure) config.onSyncFailure(item, err);
        if (config.timeline) record(TimelineEvent.ITEM_FAILED, `Batch threw: ${err.message}`, LogLevel.ERROR, { itemId: item.id });
      }
      notifyQueueChange();
    }
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Retry sweep — exponential backoff per item
// ─────────────────────────────────────────────

function startRetrySweep() {
  if (retryTimer) return;

  const scheduleNext = async () => {
    if (isOffline()) { stopRetrySweep(); return; }
    if (getPendingItems().length > 0) await syncNow();

    const baseDelay    = config.retryDelay[getNetworkState()] ?? 5000;
    const safeModeMultiplier = config.safeMode ? getRetryMultiplier() : 1;

    // Phase 6b: use backoff for sweep delay too
    const nextDelay = config.backoff
      ? calculateNetworkAwareBackoff(0, getNetworkState(), config.retryDelay, config.backoffOptions) * safeModeMultiplier
      : baseDelay * safeModeMultiplier;

    if (nextDelay > 0 && getPendingItems().length > 0) {
      retryTimer = setTimeout(scheduleNext, nextDelay);
    } else {
      retryTimer = null;
    }
  };

  retryTimer = setTimeout(scheduleNext, config.retryDelay[getNetworkState()] ?? 5000);
}

function stopRetrySweep() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function notifyQueueChange() {
  if (config.onQueueChange) config.onQueueChange(queueSize());
}

// ─────────────────────────────────────────────
// PUBLIC: Getters
// ─────────────────────────────────────────────

export function getFlapStats_()      { return getFlapStats(); }
export function getSafeModeStats_()  { return getSafeModeStats(); }
export function isInSafeMode_()      { return isInSafeMode(); }

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroy() {
  stopRetrySweep();
  clearFingerprints();
  destroyFlapGuard();
  resetSafeMode();
  clearOptimistic();
  if (backoffTracker) { backoffTracker.resetAll(); backoffTracker = null; }
  if (config.timeline) record(TimelineEvent.ENGINE_DESTROYED, "Engine destroyed", LogLevel.INFO);
  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoEngine] Destroyed.");
  }
