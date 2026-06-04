/**
 * network-quality.js — Novixo Sync (Phase 4a)
 * ──────────────────────────────────────────────
 * 4-State Network Intelligence Engine.
 *
 * Most systems only understand: online / offline
 * Novixo understands 4 real-world states:
 *
 *  🟢 STABLE    — fast, reliable   → send immediately
 *  🟡 DEGRADED  — slow, weak       → batch + compress
 *  🔴 UNSTABLE  — failing requests → queue + delay
 *  ⚫ OFFLINE   — no connection    → store locally
 *
 * WHY THIS MATTERS:
 * In real-world conditions (rain, moving vehicles, crowded areas,
 * mobile data in emerging markets), "online" doesn't mean "working".
 * This engine detects the QUALITY of the connection, not just presence.
 *
 * HOW DETECTION WORKS:
 * We ping a lightweight endpoint and measure:
 *  - latency (how long it takes)
 *  - failure rate (how often it fails)
 * Then classify into one of the 4 states.
 */

// ─────────────────────────────────────────────
// Network State Constants
// ─────────────────────────────────────────────

export const NetworkState = {
  STABLE: "STABLE",       // < 300ms latency, reliable
  DEGRADED: "DEGRADED",   // 300ms–1500ms latency, inconsistent
  UNSTABLE: "UNSTABLE",   // > 1500ms or frequent failures
  OFFLINE: "OFFLINE",     // No connection
};

// ─────────────────────────────────────────────
// Thresholds (tunable via config)
// ─────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  stableMs: 300,       // Under this = STABLE
  degradedMs: 1500,    // Under this = DEGRADED, over = UNSTABLE
  pingUrl: "https://www.google.com/favicon.ico", // Tiny file to ping
  pingInterval: 10000, // Check every 10s
  pingTimeout: 4000,   // Consider failed if no response in 4s
  failureWindow: 3,    // Track last N pings for failure rate
  unstableFailRate: 0.6, // 60%+ failures = UNSTABLE
};

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let currentState = NetworkState.OFFLINE;
let thresholds = { ...DEFAULT_THRESHOLDS };
let pingHistory = []; // Array of { latency, success } for last N pings
let pingTimer = null;
let stateListeners = []; // Callbacks: (newState, oldState) => {}

// ─────────────────────────────────────────────
// PUBLIC: Get current network state
// ─────────────────────────────────────────────

export function getNetworkState() {
  return currentState;
}

/**
 * Shorthand helpers — use these in core.js
 */
export function isStable()   { return currentState === NetworkState.STABLE; }
export function isDegraded() { return currentState === NetworkState.DEGRADED; }
export function isUnstable() { return currentState === NetworkState.UNSTABLE; }
export function isOffline()  { return currentState === NetworkState.OFFLINE; }
export function canSend()    { return currentState !== NetworkState.OFFLINE; }

// ─────────────────────────────────────────────
// PUBLIC: Listen for state changes
// ─────────────────────────────────────────────

/**
 * Register a callback that fires whenever network state changes
 * @param {Function} callback - (newState, oldState) => {}
 */
export function onStateChange(callback) {
  stateListeners.push(callback);
}

export function clearStateListeners() {
  stateListeners = [];
}

// ─────────────────────────────────────────────
// PUBLIC: Start quality monitoring
// ─────────────────────────────────────────────

/**
 * Start the network quality monitor.
 * Call once during SDK init.
 * @param {Object} userThresholds — override defaults
 */
export function startQualityMonitor(userThresholds = {}) {
  thresholds = { ...DEFAULT_THRESHOLDS, ...userThresholds };

  // Initial check
  measureQuality();

  // Periodic checks
  pingTimer = setInterval(measureQuality, thresholds.pingInterval);

  // Also listen to browser online/offline events as fast triggers
  if (typeof window !== "undefined") {
    window.addEventListener("offline", () => {
      setState(NetworkState.OFFLINE);
    });

    window.addEventListener("online", () => {
      // Don't jump to STABLE immediately — measure first
      measureQuality();
    });
  }

  console.log("[NovixoSync:Network] Quality monitor started ✓");
}

/**
 * Stop the quality monitor
 */
export function stopQualityMonitor() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Measure current network quality
// ─────────────────────────────────────────────

async function measureQuality() {
  // Quick check: if browser says offline, don't even try
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setState(NetworkState.OFFLINE);
    return;
  }

  const result = await pingNetwork();
  recordPing(result);
  classifyState();
}

/**
 * Ping a tiny resource and measure latency
 * @returns {{ success: boolean, latency: number }}
 */
async function pingNetwork() {
  const start = Date.now();

  try {
    // Use a cache-busted tiny resource to get real latency
    const url = `${thresholds.pingUrl}?t=${Date.now()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      thresholds.pingTimeout
    );

    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    return { success: true, latency };

  } catch (e) {
    const latency = Date.now() - start;
    return { success: false, latency };
  }
}

/**
 * Record a ping result into the rolling history window
 */
function recordPing(result) {
  pingHistory.push(result);

  // Keep only last N pings
  if (pingHistory.length > thresholds.failureWindow) {
    pingHistory.shift();
  }
}

/**
 * Classify the current network state based on ping history
 */
function classifyState() {
  if (pingHistory.length === 0) {
    setState(NetworkState.OFFLINE);
    return;
  }

  const recent = pingHistory[pingHistory.length - 1];

  // If latest ping completely failed → check failure rate
  if (!recent.success) {
    const failRate =
      pingHistory.filter((p) => !p.success).length / pingHistory.length;

    if (failRate >= thresholds.unstableFailRate) {
      setState(NetworkState.UNSTABLE);
    } else {
      setState(NetworkState.DEGRADED);
    }
    return;
  }

  // Latest ping succeeded — classify by latency
  const avgLatency =
    pingHistory
      .filter((p) => p.success)
      .reduce((sum, p) => sum + p.latency, 0) /
    pingHistory.filter((p) => p.success).length;

  if (avgLatency < thresholds.stableMs) {
    setState(NetworkState.STABLE);
  } else if (avgLatency < thresholds.degradedMs) {
    setState(NetworkState.DEGRADED);
  } else {
    setState(NetworkState.UNSTABLE);
  }
}

/**
 * Update current state and fire listeners if changed
 * @param {string} newState
 */
function setState(newState) {
  if (newState === currentState) return; // No change

  const oldState = currentState;
  currentState = newState;

  console.log(
    `[NovixoSync:Network] State changed: ${oldState} → ${newState}`
  );

  // Fire all registered listeners
  stateListeners.forEach((cb) => {
    try {
      cb(newState, oldState);
    } catch (e) {
      console.error("[NovixoSync:Network] Listener error:", e);
    }
  });
}

// ─────────────────────────────────────────────
// PUBLIC: Force a state (useful for testing)
// ─────────────────────────────────────────────

export function forceNetworkState(state) {
  console.log(`[NovixoSync:Network] Forced state: ${state}`);
  setState(state);
}

// ─────────────────────────────────────────────
// PUBLIC: Get ping history (useful for debugging)
// ─────────────────────────────────────────────

export function getPingHistory() {
  return [...pingHistory];
}
