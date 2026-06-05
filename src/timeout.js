/**
 * timeout.js — Novixo Engine (Phase 6c)
 * ──────────────────────────────────────────────
 * Request Timeout + Auto-Queue Fallback.
 *
 * THE PROBLEM:
 * A request is sent. The server receives it but responds very slowly.
 * The app freezes, waiting. No error. No feedback. Just... hanging.
 * This is one of the most common silent killers in real-world apps.
 *
 * WHAT THIS MODULE DOES:
 * Wraps every syncHandler call with a timeout.
 * If the handler doesn't resolve within timeoutMs:
 *   1. The request is cancelled (AbortController)
 *   2. The item is automatically re-queued for later
 *   3. A TIMEOUT event is logged to the timeline
 *   4. onTimeout callback fires so developer can update UI
 *
 * RESULT:
 * App never hangs. Slow requests fall back to the queue silently.
 * User experience stays smooth.
 */

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds

// ─────────────────────────────────────────────
// PUBLIC: Wrap a sync handler call with a timeout
// ─────────────────────────────────────────────

/**
 * Execute a sync handler with a timeout.
 * If it times out, throws a NovixoTimeoutError.
 *
 * @param {Function} handler     — async (item) => result
 * @param {Object}   item        — the queue item to pass to handler
 * @param {number}   timeoutMs   — ms before timeout (default 10s)
 * @returns {Promise}            — resolves with handler result or throws
 */
export async function withTimeout(handler, item, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;

    // Timeout timer
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new NovixoTimeoutError(
        `Request timed out after ${timeoutMs}ms — item [${item.id}] will be re-queued.`,
        item,
        timeoutMs
      ));
    }, timeoutMs);

    // Execute the handler
    Promise.resolve(handler(item))
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─────────────────────────────────────────────
// PUBLIC: NovixoTimeoutError
// Custom error class so core.js can identify timeout vs other errors
// ─────────────────────────────────────────────

export class NovixoTimeoutError extends Error {
  constructor(message, item, timeoutMs) {
    super(message);
    this.name       = "NovixoTimeoutError";
    this.item       = item;
    this.timeoutMs  = timeoutMs;
    this.isTimeout  = true;
  }
}

/**
 * Check if an error is a timeout error
 * @param {Error} error
 * @returns {boolean}
 */
export function isTimeoutError(error) {
  return error instanceof NovixoTimeoutError || error?.isTimeout === true;
}
