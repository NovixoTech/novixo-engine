/**
 * timeline.js — Novixo Engine (Phase 5a)
 * ─────────────────────────────────────────
 * Sync Timeline — Activity log for every action Novixo takes.
 *
 * WHY THIS EXISTS:
 * Developers hate black boxes. When something doesn't sync,
 * they need to know WHY and WHEN. The timeline answers both.
 *
 * WHAT IT TRACKS:
 * Every meaningful event in the SDK lifecycle:
 *  - item queued
 *  - sync attempted
 *  - sync succeeded
 *  - sync failed
 *  - conflict detected + resolved
 *  - network state changed
 *  - retry scheduled
 *  - item skipped (retry limit)
 *
 * WHAT A TIMELINE ENTRY LOOKS LIKE:
 * {
 *   id:        "evt_1717500061000_a3f9x",
 *   timestamp: 1717500061000,
 *   time:      "10:01:01",
 *   event:     "ITEM_QUEUED",
 *   itemId:    "novixo_1717500060000_b2d8k",
 *   message:   "Item queued (offline)",
 *   level:     "info",
 *   meta:      { priority: "HIGH", type: "payment" }
 * }
 */

// ─────────────────────────────────────────────
// Event type constants
// ─────────────────────────────────────────────

export const TimelineEvent = {
  // Queue events
  ITEM_QUEUED:        "ITEM_QUEUED",
  ITEM_SYNCED:        "ITEM_SYNCED",
  ITEM_FAILED:        "ITEM_FAILED",
  ITEM_SKIPPED:       "ITEM_SKIPPED",
  ITEM_RETRY:         "ITEM_RETRY",
  QUEUE_CLEARED:      "QUEUE_CLEARED",

  // Conflict events
  CONFLICT_DETECTED:  "CONFLICT_DETECTED",
  CONFLICT_RESOLVED:  "CONFLICT_RESOLVED",

  // Network events
  NETWORK_CHANGED:    "NETWORK_CHANGED",
  SYNC_STARTED:       "SYNC_STARTED",
  SYNC_COMPLETE:      "SYNC_COMPLETE",

  // System events
  ENGINE_INIT:        "ENGINE_INIT",
  ENGINE_DESTROYED:   "ENGINE_DESTROYED",
};

// Log levels
export const LogLevel = {
  INFO:    "info",
  SUCCESS: "success",
  WARN:    "warn",
  ERROR:   "error",
};

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  maxEntries: 200,       // Max entries before oldest are dropped
  persist: false,        // Persist to storage (future upgrade)
  onEntry: null,         // Callback: (entry) => {} — fires on every new entry
};

let entries = [];
let options = { ...DEFAULT_OPTIONS };
let listeners = [];

// ─────────────────────────────────────────────
// PUBLIC: Initialize timeline
// ─────────────────────────────────────────────

/**
 * Initialize the timeline with options.
 * Called once inside core.js init().
 * @param {Object} userOptions
 */
export function initTimeline(userOptions = {}) {
  options = { ...DEFAULT_OPTIONS, ...userOptions };
  entries = [];
  listeners = [];
}

// ─────────────────────────────────────────────
// PUBLIC: Record an event
// ─────────────────────────────────────────────

/**
 * Add an entry to the timeline.
 * Called throughout core.js at every key moment.
 *
 * @param {string} event   — TimelineEvent constant
 * @param {string} message — Human-readable description
 * @param {string} level   — LogLevel constant
 * @param {Object} meta    — Extra data (itemId, priority, networkState, etc.)
 * @returns {Object}       — The created entry
 */
export function record(event, message, level = LogLevel.INFO, meta = {}) {
  const now = Date.now();
  const date = new Date(now);

  const entry = {
    id: `evt_${now}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    time: date.toLocaleTimeString(),
    date: date.toLocaleDateString(),
    event,
    message,
    level,
    meta,
  };

  // Add to front (newest first)
  entries.unshift(entry);

  // Trim if over max
  if (entries.length > options.maxEntries) {
    entries = entries.slice(0, options.maxEntries);
  }

  // Fire registered listeners
  listeners.forEach((cb) => {
    try { cb(entry); } catch (e) {
      console.error("[NovixoEngine:Timeline] Listener error:", e);
    }
  });

  // Fire onEntry callback if provided
  if (options.onEntry) {
    try { options.onEntry(entry); } catch (e) {}
  }

  // Console output based on level
  const prefix = `[NovixoEngine] [${entry.time}] ${event}`;
  switch (level) {
    case LogLevel.SUCCESS: console.log(`✅ ${prefix} — ${message}`); break;
    case LogLevel.WARN:    console.warn(`⚠️  ${prefix} — ${message}`); break;
    case LogLevel.ERROR:   console.error(`❌ ${prefix} — ${message}`); break;
    default:               console.log(`ℹ️  ${prefix} — ${message}`);
  }

  return entry;
}

// ─────────────────────────────────────────────
// PUBLIC: Query the timeline
// ─────────────────────────────────────────────

/**
 * Get all timeline entries (newest first)
 * @returns {Array}
 */
export function getTimeline() {
  return [...entries];
}

/**
 * Get entries for a specific item ID
 * @param {string} itemId
 * @returns {Array}
 */
export function getItemTimeline(itemId) {
  return entries.filter((e) => e.meta?.itemId === itemId);
}

/**
 * Get entries by event type
 * @param {string} event — TimelineEvent constant
 * @returns {Array}
 */
export function getByEvent(event) {
  return entries.filter((e) => e.event === event);
}

/**
 * Get entries by log level
 * @param {string} level — LogLevel constant
 * @returns {Array}
 */
export function getByLevel(level) {
  return entries.filter((e) => e.level === level);
}

/**
 * Get only error and warning entries
 * @returns {Array}
 */
export function getIssues() {
  return entries.filter(
    (e) => e.level === LogLevel.ERROR || e.level === LogLevel.WARN
  );
}

/**
 * Get a summary of the timeline
 * @returns {Object}
 */
export function getTimelineSummary() {
  const total = entries.length;
  const synced  = entries.filter((e) => e.event === TimelineEvent.ITEM_SYNCED).length;
  const failed  = entries.filter((e) => e.event === TimelineEvent.ITEM_FAILED).length;
  const queued  = entries.filter((e) => e.event === TimelineEvent.ITEM_QUEUED).length;
  const retries = entries.filter((e) => e.event === TimelineEvent.ITEM_RETRY).length;

  return { total, synced, failed, queued, retries };
}

// ─────────────────────────────────────────────
// PUBLIC: Listen for new entries
// ─────────────────────────────────────────────

/**
 * Register a callback that fires on every new timeline entry.
 * Useful for building a live log UI.
 * @param {Function} callback — (entry) => {}
 */
export function onTimelineEntry(callback) {
  listeners.push(callback);
}

export function clearTimelineListeners() {
  listeners = [];
}

// ─────────────────────────────────────────────
// PUBLIC: Clear the timeline
// ─────────────────────────────────────────────

export function clearTimeline() {
  entries = [];
  console.log("[NovixoEngine:Timeline] Timeline cleared.");
}

// ─────────────────────────────────────────────
// PUBLIC: Export timeline as JSON string
// Useful for bug reports, developer tools
// ─────────────────────────────────────────────

export function exportTimeline() {
  return JSON.stringify(entries, null, 2);
  }
