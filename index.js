/**
 * index.js — Novixo Engine (Phase 6) — FINAL PUBLIC API
 * ──────────────────────────────────────────────────────
 *
 * import Novixo, {
 *   Priority, NetworkState, ConflictStrategy,
 *   DedupeStrategy, SafeModeState,
 *   TimelineEvent, LogLevel,
 * } from "novixo-engine";
 */

import {
  init, send, syncNow, destroy,
  sendOptimistic,
  cancelItem, updateItem, hasItem, getItem,
  getFlapStats_, getSafeModeStats_, isInSafeMode_,
} from "./src/core.js";

import { getQueue, clearQueue, queueSize } from "./src/queue.js";
import { isOnline, getNetworkState, NetworkState, forceNetworkState } from "./src/network.js";
import {
  getTimeline, getItemTimeline, getByEvent, getByLevel,
  getIssues, getTimelineSummary, clearTimeline,
  exportTimeline, onTimelineEntry, TimelineEvent, LogLevel,
} from "./src/timeline.js";
import { getFingerprintCount, clearFingerprints, DedupeStrategy } from "./src/deduplication.js";
import { getPendingOptimisticCount } from "./src/optimistic.js";

// Named exports
export { Priority }                from "./src/priority-queue.js";
export { NetworkState }            from "./src/network-quality.js";
export { ConflictStrategy }        from "./src/conflict.js";
export { TimelineEvent, LogLevel } from "./src/timeline.js";
export { DedupeStrategy }          from "./src/deduplication.js";
export { SafeModeState }           from "./src/safe-mode.js";

const Novixo = {
  // ── Core ──────────────────────────────────────────────
  init,
  send,
  syncNow,
  destroy,

  // ── Network ───────────────────────────────────────────
  isOnline,
  getNetworkState,
  forceNetworkState,

  // ── Queue ─────────────────────────────────────────────
  getQueue,
  queueSize,
  clearQueue,

  // ── Queue management (Phase 6d) ───────────────────────
  cancelItem,
  updateItem,
  hasItem,
  getItem,

  // ── Optimistic UI (Phase 6e) ──────────────────────────
  sendOptimistic,
  getPendingOptimisticCount,

  // ── Timeline (Phase 5a) ───────────────────────────────
  getTimeline,
  getItemTimeline,
  getTimelineByEvent:  getByEvent,
  getTimelineByLevel:  getByLevel,
  getTimelineIssues:   getIssues,
  getTimelineSummary,
  clearTimeline,
  exportTimeline,
  onTimelineEntry,

  // ── Deduplication (Phase 5b) ──────────────────────────
  getFingerprintCount,
  clearFingerprints,

  // ── Flap guard (Phase 5c) ─────────────────────────────
  getFlapStats: getFlapStats_,

  // ── Safe mode (Phase 5d) ──────────────────────────────
  isInSafeMode:     isInSafeMode_,
  getSafeModeStats: getSafeModeStats_,
};

export default Novixo;
