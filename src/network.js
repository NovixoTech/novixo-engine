/**
 * network.js — Novixo Sync (Phase 4a)
 * ──────────────────────────────────────
 * Network monitor — now integrates 4-state quality detection.
 *
 * BACKWARD COMPATIBLE:
 * All Phase 3 functions still work exactly the same.
 * Phase 4a adds quality-awareness on top.
 */

import {
  startQualityMonitor,
  stopQualityMonitor,
  getNetworkState,
  onStateChange,
  NetworkState,
  isStable,
  isDegraded,
  isUnstable,
  isOffline,
  canSend,
  forceNetworkState,
  getPingHistory,
} from "./network-quality.js";

// ─────────────────────────────────────────────
// Re-export everything from network-quality
// so core.js only needs to import from network.js
// ─────────────────────────────────────────────

export {
  getNetworkState,
  onStateChange,
  NetworkState,
  isStable,
  isDegraded,
  isUnstable,
  isOffline,
  canSend,
  forceNetworkState,
  getPingHistory,
};

// ─────────────────────────────────────────────
// Legacy listeners (kept from Phase 1–3)
// ─────────────────────────────────────────────

const legacyListeners = {
  online: [],
  offline: [],
};

function fireLegacyListeners(event) {
  legacyListeners[event].forEach((cb) => {
    try { cb(); } catch (e) {
      console.error(`[NovixoSync] Error in ${event} listener:`, e);
    }
  });
}

/**
 * Register a callback for online/offline transitions.
 * Still supported from Phase 1.2 — not removed.
 * @param {"online"|"offline"} event
 * @param {Function} callback
 */
export function onNetworkChange(event, callback) {
  if (!legacyListeners[event]) {
    console.warn(`[NovixoSync] Unknown network event: ${event}`);
    return;
  }
  legacyListeners[event].push(callback);
}

export function clearNetworkListeners() {
  legacyListeners.online = [];
  legacyListeners.offline = [];
}

// ─────────────────────────────────────────────
// Legacy: isOnline() — now maps to !isOffline()
// ─────────────────────────────────────────────

export function isOnline() {
  return !isOffline();
}

// ─────────────────────────────────────────────
// Start the full network monitor
// Replaces old startNetworkMonitor()
// ─────────────────────────────────────────────

/**
 * Start network monitoring — both quality detection and legacy events.
 * @param {Object} qualityConfig — optional quality threshold overrides
 */
export function startNetworkMonitor(qualityConfig = {}) {
  // Start the 4-state quality monitor
  startQualityMonitor(qualityConfig);

  // Bridge quality state changes into legacy online/offline callbacks
  // so core.js auto-sync on reconnect still works
  onStateChange((newState, oldState) => {
    const wasOffline =
      oldState === NetworkState.OFFLINE || oldState === NetworkState.UNSTABLE;
    const isNowOnline =
      newState === NetworkState.STABLE || newState === NetworkState.DEGRADED;
    const isNowOffline =
      newState === NetworkState.OFFLINE;

    if (wasOffline && isNowOnline) {
      console.log("[NovixoSync] Connection restored — firing online callbacks.");
      fireLegacyListeners("online");
    }

    if (isNowOffline) {
      console.log("[NovixoSync] Connection lost — firing offline callbacks.");
      fireLegacyListeners("offline");
    }
  });

  console.log("[NovixoSync] Network monitor started ✓");
}

export function stopNetworkMonitor() {
  stopQualityMonitor();
  clearNetworkListeners();
}
