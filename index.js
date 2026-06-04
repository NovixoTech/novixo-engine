/**
 * index.js — Novixo Engine (Phase 5c)
 * ──────────────────────────────────────
 * Public SDK entry point.
 *
 * New in Phase 5c — Flap Guard:
 *
 *   await Novixo.init({
 *     flapGuard: true,           // default: true
 *     flapGuardOptions: {
 *       stabilityMs: 3000,       // wait 3s of stable network before syncing
 *     },
 *     onFlap: (count, history) => {
 *       console.log(`Flap #${count} detected`);
 *     },
 *     onStable: () => {
 *       console.log("Network is genuinely stable — syncing now");
 *     },
 *     syncHandler: async (item) => { ... },
 *   });
 *
 *   // Check flap stats anytime
 *   const stats = Novixo.getFlapStats();
 *   // { flapCount, history, isStabilizing, stabilityMs }
 */

import { init, send, syncNow, destroy, getFlapStats_ } from "./src/core.js";
import { getQueue, clearQueue, queueSize }              from "./src/queue.js";
import {
  isOnline, getNetworkState, NetworkState, forceNetworkState,
} from "./src/network.js";
import {
  getTimeline, getItemTimeline, getByEvent, getByLevel,
  getIssues, getTimelineSummary, clearTimeline,
  exportTimeline, onTimelineEntry, TimelineEvent, LogLevel,
} from "./src/timeline.js";
import {
  getFingerprintCount, clearFingerprints, DedupeStrategy,
} from "./src/deduplication.js";

// Named exports
export { Priority }                from "./src/priority-queue.js";
export { NetworkState }            from "./src/network-quality.js";
export { ConflictStrategy }        from "./src/conflict.js";
export { TimelineEvent, LogLevel } from "./src/timeline.js";
export { DedupeStrategy }          from "./src/deduplication.js";

// Default export
const Novixo = {
  // ── Core ──
  init,
  send,
  syncNow,
  destroy,

  // ── Network ──
  isOnline,
  getNetworkState,
  forceNetworkState,

  // ── Queue ──
  getQueue,
  queueSize,
  clearQueue,

  // ── Timeline (Phase 5a) ──
  getTimeline,
  getItemTimeline,
  getTimelineByEvent:  getByEvent,
  getTimelineByLevel:  getByLevel,
  getTimelineIssues:   getIssues,
  getTimelineSummary,
  clearTimeline,
  exportTimeline,
  onTimelineEntry,

  // ── Deduplication (Phase 5b) ──
  getFingerprintCount,
  clearFingerprints,

  // ── Flap Guard (Phase 5c) ──
  getFlapStats: getFlapStats_,
};

export default Novixo;
