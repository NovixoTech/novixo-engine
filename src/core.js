/**
 * core.js — Novixo Engine (Phase 7) — COMPLETE FINAL ENGINE
 * ──────────────────────────────────────────────────────────
 * Every phase integrated:
 *   1–4:   Queue, network, storage, priority, batching, conflict
 *   5a–d:  Timeline, deduplication, flap guard, safe mode
 *   6a–e:  TypeScript, backoff, timeout, cancel/edit, optimistic UI
 *   7a:    Service worker
 *   7b:    Low network mode
 *   7c:    Transaction integrity
 *   7d:    Encrypted queue
 *   7e:    Ordered execution
 *   7f:    Response cache
 *   7g:    Event emitter
 *   7h:    Endpoint failover
 */

import { addToQueue, getPendingItems, markSynced, markFailed, resetFailed, loadQueue, queueSize, getQueueRef } from "./queue.js";
import { startNetworkMonitor, onStateChange, getNetworkState, NetworkState, isOffline } from "./network.js";
import { isStorageAvailable, initStorage }               from "./storage.js";
import { resolveConflict, isConflict, ConflictStrategy } from "./conflict.js";
import { withPriority, Priority, describePriority }      from "./priority-queue.js";
import { createBatches, getHeldBackIds, describeBatchPlan } from "./batcher.js";
import { initTimeline, record, TimelineEvent, LogLevel }    from "./timeline.js";
import { initDedupe, checkAndRegister, releaseFingerprint, clearFingerprints, DedupeStrategy } from "./deduplication.js";
import { initFlapGuard, guardedOnline, guardedOffline, getFlapStats, destroyFlapGuard } from "./flap-guard.js";
import { initSafeMode, recordAttempt, isInSafeMode, getStats as getSafeModeStats, getRetryMultiplier, resetSafeMode } from "./safe-mode.js";
import { calculateNetworkAwareBackoff, createBackoffTracker } from "./backoff.js";
import { withTimeout, isTimeoutError } from "./timeout.js";
import { injectQueueRef, cancelItem, updateItem, hasItem, getItem } from "./queue-manager.js";
import { injectOptimisticDeps, sendOptimistic, resolveOptimistic, handleOptimisticFailure, clearOptimistic } from "./optimistic.js";
import { initLowNetwork, activateLowNetwork, deactivateLowNetwork, isLowNetworkActive, optimizeItem, shouldDefer, addDeferred, clearDeferred, getLowNetworkStats } from "./low-network.js";
import { initTransactions, createTransaction, markTxnSent, markTxnConfirmed, markTxnFailed, getPendingTransactions, TxnState } from "./transaction.js";
import { initEncryption, encryptItem, decryptItem, isEncryptionReady } from "./encryption.js";
import { initOrderedQueue, areDependenciesMet, confirmItem, getReadyItems, getWaitingItems, resetOrderedQueue } from "./ordered-queue.js";
import { initCache, cacheSet, cacheGet, cacheHas, cacheFetch, cacheClear, getCacheStats, cacheDelete } from "./cache.js";
import { on, off, once, offAll, emit, NovixoEvent, getRegisteredEvents, listenerCount } from "./events.js";
import { initFailover, fetchWithFailover, getCurrentEndpoint, getFailoverStats, destroyFailover } from "./failover.js";

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

  // Phase 5a-d
  timeline: true, timelineOptions: {},
  dedupe: true,
  dedupeOptions: { strategy: DedupeStrategy.STRICT, windowMs: 5000, keyFn: null },
  onDuplicate: null,
  flapGuard: true,
  flapGuardOptions: { stabilityMs: 3000, maxFlaps: 10 },
  onFlap: null, onStable: null,
  safeMode: true,
  safeModeOptions: { window: 10, enterThreshold: 0.6, exitThreshold: 0.3, retryMultiplier: 3 },
  onSafeMode: null, onSafeModeExit: null,

  // Phase 6b-e
  backoff: true,
  backoffOptions: { baseDelay: 1000, maxDelay: 30000, multiplier: 2, jitter: true },
  timeout: true, timeoutMs: 10000, onTimeout: null,

  // Phase 7b
  lowNetwork: true,
  lowNetworkOptions: { stripFields: [], compressStrings: true, deferLowPriority: true },
  onLowNetworkOn: null, onLowNetworkOff: null,

  // Phase 7c
  transactions: false,

  // Phase 7d
  encryption: false, encryptionKey: null,

  // Phase 7e
  orderedExecution: true,

  // Phase 7f
  cache: true,

  // Phase 7h
  endpoints: [], // fallback endpoints for failover
  failoverOptions: {},

  // Callbacks
  onSyncSuccess: null, onSyncFailure: null,
  onQueueChange: null, onNetworkStateChange: null,

  // Required
  syncHandler: null, batchSyncHandler: null,
};

let config         = { ...DEFAULT_CONFIG };
let retryTimer     = null;
let initialized    = false;
let backoffTracker = null;

// ─────────────────────────────────────────────
// PUBLIC: Initialize
// ─────────────────────────────────────────────

export async function init(userConfig = {}) {
  if (initialized) { console.warn("[NovixoEngine] Already initialized."); return; }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  if (!config.syncHandler) console.error("[NovixoEngine] No syncHandler provided.");

  // Init all subsystems
  if (config.timeline)  initTimeline(config.timelineOptions);
  if (config.dedupe)    initDedupe(config.dedupeOptions);
  if (config.flapGuard) initFlapGuard({ ...config.flapGuardOptions, onFlap: config.onFlap, onStable: config.onStable });
  if (config.safeMode)  initSafeMode({
    ...config.safeModeOptions,
    onSafeMode:     (stats) => { config.onSafeMode?.(stats);     emit(NovixoEvent.SAFE_MODE_ON, stats); },
    onSafeModeExit: (stats) => { config.onSafeModeExit?.(stats); emit(NovixoEvent.SAFE_MODE_OFF, stats); },
  });
  if (config.backoff)       backoffTracker = createBackoffTracker(config.backoffOptions);
  if (config.lowNetwork)    initLowNetwork({ ...config.lowNetworkOptions, onLowNetworkOn: () => { config.onLowNetworkOn?.(); emit(NovixoEvent.LOW_NETWORK_ON); }, onLowNetworkOff: () => { config.onLowNetworkOff?.(); emit(NovixoEvent.LOW_NETWORK_OFF); } });
  if (config.transactions)  await initTransactions();
  if (config.encryption && config.encryptionKey) await initEncryption(config.encryptionKey);
  if (config.orderedExecution) initOrderedQueue();
  if (config.cache)         await initCache();
  if (config.endpoints?.length) initFailover(config.endpoints, config.failoverOptions);

  // Storage + queue
  await initStorage(config.platform);
  if (!(await isStorageAvailable())) console.warn("[NovixoEngine] Storage unavailable.");
  await loadQueue();
  injectQueueRef(getQueueRef());
  injectOptimisticDeps(send);

  // Network monitor
  startNetworkMonitor(config.qualityConfig);

  onStateChange(async (newState, oldState) => {
    if (config.timeline) record(TimelineEvent.NETWORK_CHANGED, `Network: ${oldState} → ${newState}`, newState === NetworkState.OFFLINE ? LogLevel.WARN : LogLevel.INFO, { newState, oldState });
    emit(NovixoEvent.NETWORK, newState, oldState);
    if (config.onNetworkStateChange) config.onNetworkStateChange(newState, oldState);

    if (config.lowNetwork) {
      if (newState === NetworkState.DEGRADED || newState === NetworkState.UNSTABLE || newState === NetworkState.OFFLINE) {
        activateLowNetwork();
      } else if (newState === NetworkState.STABLE) {
        deactivateLowNetwork();
        const deferred = clearDeferred();
        for (const item of deferred) { await addToQueue(item); notifyQueueChange(); }
      }
    }

    if (!config.autoSync) return;
    const comingOnline = newState === NetworkState.STABLE || newState === NetworkState.DEGRADED;
    const goingOffline = newState === NetworkState.OFFLINE || newState === NetworkState.UNSTABLE;

    if (comingOnline) {
      const doSync = async () => { await resetFailed(); if (backoffTracker) backoffTracker.resetAll(); startRetrySweep(); };
      config.flapGuard ? guardedOnline(doSync, newState) : await doSync();
    }
    if (goingOffline) { if (config.flapGuard) guardedOffline(newState); stopRetrySweep(); }
  });

  initialized = true;

  if (config.timeline) record(TimelineEvent.ENGINE_INIT, `Engine ready | queue:${queueSize()} | enc:${isEncryptionReady()} | cache:${config.cache} | failover:${config.endpoints?.length ?? 0} endpoints`, LogLevel.INFO);
  emit(NovixoEvent.INIT);

  console.log(`[NovixoEngine] ✓ Ready | Queue:${queueSize()} | Enc:${isEncryptionReady()} | Cache:${config.cache} | Failover:${config.endpoints?.length ?? 0}`);
}

// ─────────────────────────────────────────────
// PUBLIC: Send
// ─────────────────────────────────────────────

export async function send(data, priority = config.defaultPriority) {
  const enriched = withPriority(data, priority);
  const tempItem = { ...enriched, id: `temp_${Date.now()}` };

  // Deduplication
  if (config.dedupe) {
    const { isDuplicate, originalId } = checkAndRegister(tempItem);
    if (isDuplicate) {
      if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Duplicate dropped — matches [${originalId}]`, LogLevel.WARN, { originalId });
      emit(NovixoEvent.DUPLICATE, tempItem, originalId);
      if (config.onDuplicate) config.onDuplicate(tempItem, originalId);
      return originalId;
    }
    releaseFingerprint(tempItem.id);
  }

  // Low network: defer LOW priority
  if (config.lowNetwork && shouldDefer(enriched)) {
    addDeferred(enriched);
    if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Deferred — LOW priority on low network`, LogLevel.WARN, { priority });
    return `deferred_${Date.now()}`;
  }

  // Encrypt before queuing
  const toQueue = config.encryption && isEncryptionReady() ? await encryptItem(enriched) : enriched;

  const id = await addToQueue(toQueue);
  notifyQueueChange();
  if (config.dedupe) checkAndRegister({ ...enriched, id });

  const state = getNetworkState();
  if (config.timeline) record(TimelineEvent.ITEM_QUEUED, `Queued — ${describePriority(priority)} — ${state}`, LogLevel.INFO, { itemId: id, priority, type: data.type, networkState: state, encrypted: isEncryptionReady() });
  emit(NovixoEvent.QUEUED, { id, ...enriched });

  if (state === NetworkState.OFFLINE) return id;
  if (isInSafeMode() && priority !== Priority.HIGH) return id;
  if (state === NetworkState.UNSTABLE && priority !== Priority.HIGH) return id;

  await trySyncItem({ id, ...toQueue, retries: 0, status: "pending" });
  return id;
}

// ─────────────────────────────────────────────
// PUBLIC: sendTransaction (Phase 7c)
// ─────────────────────────────────────────────

export async function sendTransaction(data, priority = Priority.HIGH) {
  if (!config.transactions) { console.warn("[NovixoEngine] Set transactions:true in config."); return send(data, priority); }
  const txnItem = createTransaction(data);
  if (!txnItem) return null;
  return send(txnItem, priority);
}

// ─────────────────────────────────────────────
// PUBLIC: Re-exports from sub-modules
// ─────────────────────────────────────────────

export { sendOptimistic, cancelItem, updateItem, hasItem, getItem };
export { on, off, once, offAll, NovixoEvent, getRegisteredEvents, listenerCount };
export { cacheSet, cacheGet, cacheHas, cacheFetch, cacheClear, getCacheStats, cacheDelete };
export { fetchWithFailover, getCurrentEndpoint, getFailoverStats };

// ─────────────────────────────────────────────
// PUBLIC: syncNow
// ─────────────────────────────────────────────

export async function syncNow() {
  const state = getNetworkState();
  if (state === NetworkState.OFFLINE) return;

  let pending = getPendingItems();
  if (!pending.length) return;

  // Ordered execution: only ready items
  if (config.orderedExecution) {
    const waiting = getWaitingItems(pending);
    pending       = getReadyItems(pending);
    if (waiting.length > 0 && config.timeline) record(TimelineEvent.ITEM_SKIPPED, `${waiting.length} item(s) waiting on dependencies`, LogLevel.INFO, { waitingCount: waiting.length });
    if (!pending.length) return;
  }

  // Safe mode: HIGH only
  if (isInSafeMode()) {
    pending = pending.filter((i) => i.priority === Priority.HIGH);
    if (!pending.length) return;
  }

  if (config.timeline) record(TimelineEvent.SYNC_STARTED, `Sync — ${pending.length} item(s) — ${state}`, LogLevel.INFO, { count: pending.length, networkState: state });

  if (!isInSafeMode() && config.batchSyncHandler) {
    await syncBatches(createBatches(pending, state, config.batchConfig));
  } else {
    for (const item of pending) {
      if (item.retries >= config.retryLimit) continue;
      await trySyncItem(item);
    }
  }

  if (config.timeline) record(TimelineEvent.SYNC_COMPLETE, "Sync complete", LogLevel.SUCCESS, { networkState: state });
}

// ─────────────────────────────────────────────
// INTERNAL: Try sync one item
// ─────────────────────────────────────────────

async function trySyncItem(item) {
  // Phase 7e: dependency check
  if (config.orderedExecution && !areDependenciesMet(item)) {
    if (config.timeline) record(TimelineEvent.ITEM_SKIPPED, `Waiting on dependencies`, LogLevel.INFO, { itemId: item.id });
    return;
  }

  // Phase 7d: decrypt
  const decrypted = config.encryption && isEncryptionReady() && item._encrypted ? await decryptItem(item) : item;

  // Phase 7b: optimize on low network
  const toSync = config.lowNetwork && isLowNetworkActive() ? optimizeItem(decrypted) : decrypted;

  if (toSync.retries > 0 && config.timeline) record(TimelineEvent.ITEM_RETRY, `Retry ${toSync.retries}`, LogLevel.WARN, { itemId: toSync.id });
  if (toSync.retries > 0) emit(NovixoEvent.RETRY, toSync);

  // Phase 7c: mark sent
  if (config.transactions && toSync._idempotencyKey) await markTxnSent(toSync._idempotencyKey);

  try {
    const handlerToCall = config.timeout
      ? () => withTimeout(config.syncHandler, toSync, config.timeoutMs)
      : () => config.syncHandler(toSync);

    const response = await handlerToCall();

    // ── CONFLICT ──
    if (isConflict(response)) {
      if (config.safeMode) recordAttempt(false);
      if (config.transactions && toSync._idempotencyKey) await markTxnFailed(toSync._idempotencyKey, "conflict");
      emit(NovixoEvent.CONFLICT, item, response.serverItem);
      if (config.timeline) record(TimelineEvent.CONFLICT_DETECTED, `Conflict — ${config.conflictStrategy}`, LogLevel.WARN, { itemId: item.id });
      const resolved = await resolveConflict(item, response.serverItem, config.conflictStrategy, config.onConflict);
      if (config.onConflictResolved) config.onConflictResolved(resolved, config.conflictStrategy);
      if (config.timeline) record(TimelineEvent.CONFLICT_RESOLVED, `Resolved — ${resolved.id === item.id ? "client" : "server"} wins`, LogLevel.INFO, { itemId: item.id });
      await markSynced(item.id); releaseFingerprint(item.id);
      if (backoffTracker) backoffTracker.reset(item.id);
      notifyQueueChange();
      if (resolved.id === item.id) { await addToQueue({ ...resolved, id: undefined }); notifyQueueChange(); }
      return;
    }

    // ── SUCCESS ──
    if (response === true) {
      if (config.safeMode) recordAttempt(true);
      await markSynced(item.id); releaseFingerprint(item.id);
      if (backoffTracker) backoffTracker.reset(item.id);
      if (config.orderedExecution) confirmItem(item.id);
      if (config.transactions && toSync._idempotencyKey) await markTxnConfirmed(toSync._idempotencyKey);
      notifyQueueChange();
      if (config.onSyncSuccess) config.onSyncSuccess(item);
      resolveOptimistic(item);
      emit(NovixoEvent.SYNCED, item);
      if (config.timeline) record(TimelineEvent.ITEM_SYNCED, `Synced — ${describePriority(item.priority)}`, LogLevel.SUCCESS, { itemId: item.id, priority: item.priority });
      return;
    }

    throw new Error("syncHandler returned false");

  } catch (err) {
    if (config.safeMode) recordAttempt(false);
    if (backoffTracker) backoffTracker.recordFailure(item.id);
    if (config.transactions && toSync._idempotencyKey) await markTxnFailed(toSync._idempotencyKey, err.message);

    if (isTimeoutError(err)) {
      if (config.timeline) record(TimelineEvent.ITEM_FAILED, `Timeout after ${config.timeoutMs}ms — re-queued`, LogLevel.WARN, { itemId: item.id });
      emit(NovixoEvent.TIMEOUT, item);
      if (config.onTimeout) config.onTimeout(item);
    } else {
      if (config.timeline) record(TimelineEvent.ITEM_FAILED, `Failed — ${err.message}`, LogLevel.ERROR, { itemId: item.id, error: err.message });
    }

    await markFailed(item.id); notifyQueueChange();
    if (config.onSyncFailure) config.onSyncFailure(item, err);
    emit(NovixoEvent.FAILED, item, err);

    const tempId = item?._optimisticTempId ?? item?.payload?._optimisticTempId;
    if (tempId && item.retries >= config.retryLimit) handleOptimisticFailure(tempId, err);
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
          if (config.orderedExecution) confirmItem(item.id);
          resolveOptimistic(item);
          emit(NovixoEvent.SYNCED, item);
          if (config.onSyncSuccess) config.onSyncSuccess(item);
          if (config.timeline) record(TimelineEvent.ITEM_SYNCED, "Batch synced", LogLevel.SUCCESS, { itemId: item.id });
        } else {
          await markFailed(item.id);
          if (backoffTracker) backoffTracker.recordFailure(item.id);
          emit(NovixoEvent.FAILED, item, new Error("Batch failed"));
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
        emit(NovixoEvent.FAILED, item, err);
        if (config.onSyncFailure) config.onSyncFailure(item, err);
      }
      notifyQueueChange();
    }
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Retry sweep
// ─────────────────────────────────────────────

function startRetrySweep() {
  if (retryTimer) return;
  const scheduleNext = async () => {
    if (isOffline()) { stopRetrySweep(); return; }
    if (getPendingItems().length > 0) await syncNow();
    const baseDelay  = config.retryDelay[getNetworkState()] ?? 5000;
    const multiplier = config.safeMode ? getRetryMultiplier() : 1;
    const nextDelay  = config.backoff
      ? calculateNetworkAwareBackoff(0, getNetworkState(), config.retryDelay, config.backoffOptions) * multiplier
      : baseDelay * multiplier;
    if (nextDelay > 0 && getPendingItems().length > 0) { retryTimer = setTimeout(scheduleNext, nextDelay); }
    else { retryTimer = null; }
  };
  retryTimer = setTimeout(scheduleNext, config.retryDelay[getNetworkState()] ?? 5000);
}

function stopRetrySweep() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function notifyQueueChange() {
  if (config.onQueueChange) config.onQueueChange(queueSize());
  emit(NovixoEvent.QUEUE_CHANGE, queueSize());
}

// ─────────────────────────────────────────────
// PUBLIC: Getters
// ─────────────────────────────────────────────

export function getFlapStats_()           { return getFlapStats(); }
export function getSafeModeStats_()       { return getSafeModeStats(); }
export function isInSafeMode_()           { return isInSafeMode(); }
export function getLowNetworkStats_()     { return getLowNetworkStats(); }
export function getPendingTransactions_() { return getPendingTransactions(); }
export function isEncryptionReady_()      { return isEncryptionReady(); }

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroy() {
  stopRetrySweep();
  clearFingerprints();
  destroyFlapGuard();
  resetSafeMode();
  clearOptimistic();
  resetOrderedQueue();
  destroyFailover();
  if (backoffTracker) { backoffTracker.resetAll(); backoffTracker = null; }
  if (config.timeline) record(TimelineEvent.ENGINE_DESTROYED, "Engine destroyed", LogLevel.INFO);
  emit(NovixoEvent.DESTROY);
  offAll();
  initialized = false;
  config = { ...DEFAULT_CONFIG };
  console.log("[NovixoEngine] Destroyed.");
}
