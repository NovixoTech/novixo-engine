/**
 * safe-mode.js — Novixo Engine (Phase 5d)
 * ──────────────────────────────────────────────
 * Safe Mode System.
 *
 * THE PROBLEM:
 * When a server is struggling, a naive SDK hammers it with retries
 * — making things worse.
 *
 * Real scenarios:
 *  - Server overloaded   → SDK retries 100x → server crashes harder ❌
 *  - API rate limit hit  → SDK keeps retrying → account gets banned ❌
 *  - Network dead        → SDK drains battery with constant retries ❌
 *
 * WHAT SAFE MODE DOES:
 * Monitors the failure rate via a rolling window.
 * When failures hit a threshold → SAFE MODE activates:
 *  • Only HIGH priority items sync
 *  • Retry delays multiplied (aggressive backoff)
 *  • No batch sync — careful one-by-one only
 *  • Developer notified via onSafeMode callback
 *
 * RECOVERY:
 * When successes return, failure rate drops.
 * Safe mode exits automatically → normal behaviour resumes.
 *
 * HOW FAILURE RATE IS MEASURED:
 * Rolling window of last N attempts.
 * fails / total >= enterThreshold  → enter safe mode
 * fails / total <= exitThreshold   → exit safe mode
 */

export const SafeModeState = {
  NORMAL:    "NORMAL",
  SAFE_MODE: "SAFE_MODE",
};

const DEFAULT_OPTIONS = {
  enabled:           true,
  window:            10,      // Track last N sync attempts
  enterThreshold:    0.6,     // 60% failure rate → enter safe mode
  exitThreshold:     0.3,     // 30% failure rate → exit safe mode
  retryMultiplier:   3,       // Multiply retry delays in safe mode
  onSafeMode:        null,    // (stats) => {}
  onSafeModeExit:    null,    // (stats) => {}
  onAttemptRecorded: null,    // (stats) => {}
};

let options     = { ...DEFAULT_OPTIONS };
let state       = SafeModeState.NORMAL;
let attempts    = [];  // rolling window: true=success, false=failure
let totalSynced = 0;
let totalFailed = 0;
let enteredAt   = null;
let exitedAt    = null;

// ── Init ──────────────────────────────────────

export function initSafeMode(userOptions = {}) {
  options     = { ...DEFAULT_OPTIONS, ...userOptions };
  state       = SafeModeState.NORMAL;
  attempts    = [];
  totalSynced = 0;
  totalFailed = 0;
  enteredAt   = null;
  exitedAt    = null;
}

// ── Record attempt ────────────────────────────

/**
 * Record a sync attempt result. Re-evaluates safe mode after each call.
 * Called by core.js after every trySyncItem.
 * @param {boolean} success
 * @returns {string} current SafeModeState
 */
export function recordAttempt(success) {
  if (!options.enabled) return state;

  if (success) totalSynced++; else totalFailed++;

  attempts.push(success);
  if (attempts.length > options.window) attempts.shift();

  evaluate();

  if (options.onAttemptRecorded) options.onAttemptRecorded(getStats());

  return state;
}

// ── Query ─────────────────────────────────────

export function isInSafeMode()     { return state === SafeModeState.SAFE_MODE; }
export function getSafeModeState() { return state; }

export function getStats() {
  const windowSize  = attempts.length;
  const windowFails = attempts.filter((a) => !a).length;
  const failureRate = windowSize > 0 ? windowFails / windowSize : 0;

  return {
    state,
    isInSafeMode:    state === SafeModeState.SAFE_MODE,
    failureRate:     Math.round(failureRate * 100) + "%",
    failureRateRaw:  failureRate,
    windowSize,
    windowFails,
    totalSynced,
    totalFailed,
    enteredAt,
    exitedAt,
    retryMultiplier: options.retryMultiplier,
  };
}

/**
 * Returns retry delay multiplier.
 * 1 in NORMAL, retryMultiplier in SAFE_MODE.
 * core.js multiplies all retry delays by this.
 */
export function getRetryMultiplier() {
  if (!options.enabled || state === SafeModeState.NORMAL) return 1;
  return options.retryMultiplier;
}

// ── Force (for testing) ───────────────────────

export function forceSafeMode()   { enterSafeMode(); }
export function forceNormalMode() { exitSafeMode();  }

export function resetSafeMode() {
  attempts    = [];
  totalSynced = 0;
  totalFailed = 0;
  state       = SafeModeState.NORMAL;
  enteredAt   = null;
  exitedAt    = null;
}

// ── Internal ──────────────────────────────────

function evaluate() {
  if (attempts.length < Math.ceil(options.window / 2)) return;

  const fails       = attempts.filter((a) => !a).length;
  const failureRate = fails / attempts.length;

  if (state === SafeModeState.NORMAL && failureRate >= options.enterThreshold) {
    enterSafeMode();
  } else if (state === SafeModeState.SAFE_MODE && failureRate <= options.exitThreshold) {
    exitSafeMode();
  }
}

function enterSafeMode() {
  if (state === SafeModeState.SAFE_MODE) return;
  state     = SafeModeState.SAFE_MODE;
  enteredAt = Date.now();
  console.warn(
    `[NovixoEngine:SafeMode] ⚠️  SAFE MODE ON — failure rate too high. ` +
    `Only HIGH priority syncing. Retry delays ${options.retryMultiplier}x.`
  );
  if (options.onSafeMode) options.onSafeMode(getStats());
}

function exitSafeMode() {
  if (state === SafeModeState.NORMAL) return;
  state    = SafeModeState.NORMAL;
  exitedAt = Date.now();
  console.log("[NovixoEngine:SafeMode] ✅ Safe mode OFF — failure rate recovered.");
  if (options.onSafeModeExit) options.onSafeModeExit(getStats());
  }
