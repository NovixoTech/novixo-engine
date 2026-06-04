/**
 * index.js — Novixo Engine (Phase 5a)
 * ──────────────────────────────────────
 * Public SDK entry point.
 *
 * New in Phase 5a:
 *   import Novixo, { Priority, NetworkState, ConflictStrategy, TimelineEvent } from "novixo-engine";
 *
 * ── TIMELINE USAGE ──
 *   await Novixo.init({
 *     timeline: true,  // default: true
 *
 *     timelineOptions: {
 *       maxEntries: 200,
 *       onEntry: (entry) => {
 *         // fires on every new timeline entry
 *         console.log(`[${entry.time}] ${entry.event} — ${entry.message}`);
 *       },
 *     },
 *     syncHandler: async (item) => { ... },
 *   });
 *
 *   // Read the timeline anytime
 *   const log = Novixo.getTimeline();
 *   const issues = Novixo.getTimelineIssues();
 *   const summary = Novixo.getTimelineSummary();
 *   const itemLog = Novixo.getItemTimeline("novixo_123_abc");
 *
 *   // Export for bug reports
 *   const json = Novixo.exportTimeline();
 *
 *   // Clear
 *   Novixo.clearTimeline();
 */

import { init, send, syncNow, destroy } from "./src/core.js";
import { getQueue, clearQueue, queueSize } from "./src/queue.js";
import {
  isOnline,
  getNetworkState,
  NetworkState,
  forceNetworkState,
} from "./src/network.js";
import {
  getTimeline,
  getItemTimeline,
  getByEvent,
  getByLevel,
  getIssues,
  getTimelineSummary,
  clearTimeline,
  exportTimeline,
  onTimelineEntry,
  TimelineEvent,
  LogLevel,
} from "./src/timeline.js";

// Named exports
export { Priority }           from "./src/priority-queue.js";
export { NetworkState }       from "./src/network-quality.js";
export { ConflictStrategy }   from "./src/conflict.js";
export { TimelineEvent, LogLevel } from "./src/timeline.js";

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
  getTimelineByEvent: getByEvent,
  getTimelineByLevel: getByLevel,
  getTimelineIssues: getIssues,
  getTimelineSummary,
  clearTimeline,
  exportTimeline,
  onTimelineEntry,
};

export default Novixo;
