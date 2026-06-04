/**
 * flap-guard.js — Novixo Engine (Phase 5c)
 * ──────────────────────────────────────────────
 * Network Flap Protection.
 *
 * THE PROBLEM — NETWORK FLAPPING:
 * A "flap" is when the network rapidly switches states:
 *   online → offline → online → offline (within seconds)
 *
 * This is extremely common in:
 *   - Moving vehicles (cars, buses, trains)
 *   - Elevators
 *   - Rain / bad weather (especially on mobile towers)
 *   - Crowded areas with congested WiFi
 *   - Walking between WiFi zones
 *
 * WITHOUT flap protection:
 *   Network comes back for 200ms → sync fires immediately
 *   Network drops again           → sync fails mid-way
 *   Network comes back for 300ms → sync fires AGAIN
 *   Result: retry storm, duplicate attempts, wasted data ❌
 *
 * WITH flap protection:
 *   Network fluctuates             → guard watches silently
 *   Network stable for X seconds   → NOW sync fires ✓
 *   Result: one clean sync, no wasted requests ✓
 *
 * HOW IT WORKS:
 * The FlapGuard wraps network "online" events with a stability window.
 * Instead of firing immediately when the network comes back,
 * it waits for the network to stay stable for `stabilityMs` (default 3s).
 * If it drops again within that window, the timer resets.
 * Only when the full window passes without interruption does it fire.
 *
 *   ONLINE event received
 *        ↓
 *   Start stability timer (3s)
 *        ↓
 *   Network drops again? → reset timer
 *   Timer completes?     → fire "stable" callback ✓
 */

// ─────────────────────────────────────────────
// Default options
// ─────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  enabled:      true,
  stabilityMs:  3000,   // How long network must stay stable before firing
  maxFlaps:     10,     // Max flaps to track in history
  onFlap:       null,   // Callback: (flapCount, history) => {} — fires on each flap
  onStable:     null,   // Callback: () => {} — fires when network is genuinely stable
};

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let options    = { ...DEFAULT_OPTIONS };
let stabilityTimer = null;
let flapHistory    = [];  // Array of { event, timestamp }
let flapCount      = 0;
let lastState      = null;
let pendingCallback = null; // The callback waiting to fire after stability

// ─────────────────────────────────────────────
// PUBLIC: Initialize
// ─────────────────────────────────────────────

/**
 * Initialize the flap guard.
 * Called once during SDK init.
 * @param {Object} userOptions
 */
export function initFlapGuard(userOptions = {}) {
  options     = { ...DEFAULT_OPTIONS, ...userOptions };
  flapHistory = [];
  flapCount   = 0;
  lastState   = null;
  clearPendingTimer();
}

// ─────────────────────────────────────────────
// PUBLIC: Wrap a callback with flap protection
// ─────────────────────────────────────────────

/**
 * Call this instead of firing your "online" callback directly.
 * The FlapGuard will hold it until the network is genuinely stable.
 *
 * Usage in network.js / core.js:
 *   Instead of:  onNetworkChange("online", () => syncNow())
 *   Use:         onNetworkChange("online", () => flapGuard.guardedOnline(syncNow))
 *
 * @param {Function} callback — what to fire when network is truly stable
 * @param {string}   newState — the new network state that triggered this
 */
export function guardedOnline(callback, newState = "ONLINE") {
  if (!options.enabled) {
    // Flap guard disabled — fire immediately
    callback();
    return;
  }

  recordEvent(newState);

  // Cancel any existing stability timer — we just got a new event
  clearPendingTimer();

  // Store the callback for when stability is confirmed
  pendingCallback = callback;

  // Start the stability window
  stabilityTimer = setTimeout(() => {
    // Timer completed without interruption — network is stable
    stabilityTimer = null;

    console.log(
      `[NovixoEngine:FlapGuard] Network stable for ${options.stabilityMs}ms — firing callback.`
    );

    if (options.onStable) options.onStable();
    if (pendingCallback) {
      pendingCallback();
      pendingCallback = null;
    }
  }, options.stabilityMs);

  console.log(
    `[NovixoEngine:FlapGuard] Network back — waiting ${options.stabilityMs}ms for stability...`
  );
}

/**
 * Call this when the network goes OFFLINE or UNSTABLE.
 * Cancels any pending stability timer — prevents premature sync.
 * @param {string} newState
 */
export function guardedOffline(newState = "OFFLINE") {
  if (!options.enabled) return;

  if (stabilityTimer) {
    // Network dropped before stability window completed — this is a flap
    flapCount++;
    recordEvent(newState);

    console.log(
      `[NovixoEngine:FlapGuard] Flap #${flapCount} detected (${newState}) — stability timer reset.`
    );

    if (options.onFlap) {
      options.onFlap(flapCount, [...flapHistory]);
    }

    clearPendingTimer();
  }
}

// ─────────────────────────────────────────────
// PUBLIC: Check if network is currently in stability window
// ─────────────────────────────────────────────

/**
 * Returns true if we're waiting for stability (timer is running).
 * Useful for UI — show "reconnecting..." instead of "online"
 */
export function isWaitingForStability() {
  return stabilityTimer !== null;
}

// ─────────────────────────────────────────────
// PUBLIC: Get flap statistics
// ─────────────────────────────────────────────

/**
 * Returns flap stats — useful for debugging and timeline
 */
export function getFlapStats() {
  return {
    flapCount,
    history:    [...flapHistory],
    isStabilizing: isWaitingForStability(),
    stabilityMs: options.stabilityMs,
  };
}

/**
 * Reset flap counter and history
 */
export function resetFlapStats() {
  flapCount   = 0;
  flapHistory = [];
}

// ─────────────────────────────────────────────
// PUBLIC: Teardown
// ─────────────────────────────────────────────

export function destroyFlapGuard() {
  clearPendingTimer();
  flapHistory     = [];
  flapCount       = 0;
  lastState       = null;
  pendingCallback = null;
}

// ─────────────────────────────────────────────
// INTERNAL helpers
// ─────────────────────────────────────────────

function clearPendingTimer() {
  if (stabilityTimer) {
    clearTimeout(stabilityTimer);
    stabilityTimer = null;
  }
}

function recordEvent(state) {
  const entry = { state, timestamp: Date.now() };
  flapHistory.unshift(entry);

  // Keep only last N events
  if (flapHistory.length > options.maxFlaps) {
    flapHistory = flapHistory.slice(0, options.maxFlaps);
  }

  lastState = state;
    }
