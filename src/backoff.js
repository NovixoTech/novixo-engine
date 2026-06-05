/**
 * backoff.js — Novixo Engine (Phase 6b)
 * ──────────────────────────────────────────────
 * Exponential Backoff Calculator.
 *
 * THE PROBLEM WITH FIXED RETRIES:
 * Retrying every 3 seconds forever is wasteful and server-unfriendly.
 * If a server is struggling, constant retries make it worse.
 *
 * EXPONENTIAL BACKOFF:
 * Wait longer after each failure:
 *   Attempt 1 failed → wait 1s
 *   Attempt 2 failed → wait 2s
 *   Attempt 3 failed → wait 4s
 *   Attempt 4 failed → wait 8s
 *   Attempt 5 failed → wait 16s  (capped at maxDelay)
 *
 * JITTER:
 * Adds a small random offset to each delay.
 * Prevents "thundering herd" — when 1000 clients all retry at
 * exactly the same moment and overwhelm the server together.
 *
 * Formula:
 *   delay = min(baseDelay * (2 ^ attempt), maxDelay) + random jitter
 */

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  baseDelay:  1000,    // 1s starting delay
  maxDelay:   30000,   // 30s maximum delay
  multiplier: 2,       // double each time
  jitter:     true,    // add random offset
  jitterMax:  1000,    // max jitter offset in ms
};

// ─────────────────────────────────────────────
// PUBLIC: Calculate delay for a given attempt number
// ─────────────────────────────────────────────

/**
 * Calculate the backoff delay for a retry attempt.
 *
 * @param {number} attempt       — 0-indexed attempt number (0 = first retry)
 * @param {Object} userOptions   — override defaults
 * @returns {number}             — delay in milliseconds
 *
 * @example
 * calculateBackoff(0) // ~1000ms
 * calculateBackoff(1) // ~2000ms
 * calculateBackoff(2) // ~4000ms
 * calculateBackoff(3) // ~8000ms
 * calculateBackoff(4) // ~16000ms
 * calculateBackoff(10) // ~30000ms (capped)
 */
export function calculateBackoff(attempt, userOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...userOptions };

  // Exponential: base * (multiplier ^ attempt)
  const exponential = opts.baseDelay * Math.pow(opts.multiplier, attempt);

  // Cap at maxDelay
  const capped = Math.min(exponential, opts.maxDelay);

  // Add jitter
  const jitter = opts.jitter
    ? Math.random() * opts.jitterMax
    : 0;

  return Math.round(capped + jitter);
}

// ─────────────────────────────────────────────
// PUBLIC: Per-item backoff tracker
// Tracks retry counts per item ID
// ─────────────────────────────────────────────

/**
 * Create a backoff tracker for a set of items.
 * Keeps retry counts per item so each item has its own backoff curve.
 *
 * @param {Object} options — backoff options
 * @returns {Object} tracker with getDelay, recordFailure, reset methods
 */
export function createBackoffTracker(options = {}) {
  const retryCounts = new Map(); // itemId → attempt count

  return {
    /**
     * Get the next delay for an item.
     * @param {string} itemId
     * @returns {number} delay in ms
     */
    getDelay(itemId) {
      const attempt = retryCounts.get(itemId) ?? 0;
      return calculateBackoff(attempt, options);
    },

    /**
     * Record a failure for an item — increments its attempt count.
     * @param {string} itemId
     */
    recordFailure(itemId) {
      const current = retryCounts.get(itemId) ?? 0;
      retryCounts.set(itemId, current + 1);
    },

    /**
     * Reset an item's backoff (e.g. after success).
     * @param {string} itemId
     */
    reset(itemId) {
      retryCounts.delete(itemId);
    },

    /**
     * Reset all backoff state.
     */
    resetAll() {
      retryCounts.clear();
    },

    /**
     * Get attempt count for an item.
     * @param {string} itemId
     * @returns {number}
     */
    getAttempts(itemId) {
      return retryCounts.get(itemId) ?? 0;
    },
  };
}

// ─────────────────────────────────────────────
// PUBLIC: Network-state-aware backoff
// Combines network state base delay with exponential backoff
// ─────────────────────────────────────────────

/**
 * Calculate delay that respects both network state AND backoff curve.
 * The network state sets the floor — backoff scales up from there.
 *
 * @param {number} attempt       — retry attempt number
 * @param {string} networkState  — current NetworkState
 * @param {Object} baseDelays    — { STABLE, DEGRADED, UNSTABLE, OFFLINE }
 * @param {Object} backoffOpts   — backoff options
 * @returns {number}             — delay in ms
 */
export function calculateNetworkAwareBackoff(
  attempt,
  networkState,
  baseDelays = {},
  backoffOpts = {}
) {
  const networkBase = baseDelays[networkState] ?? 3000;

  const opts = {
    ...DEFAULT_OPTIONS,
    baseDelay: networkBase,
    ...backoffOpts,
  };

  return calculateBackoff(attempt, opts);
}
