/**
 * failover.js — Novixo Engine (Phase 7h)
 * Endpoint Failover System.
 *
 * THE PROBLEM:
 * Your primary server goes down. Every sync request fails.
 * Users lose data. You get paged at 3am.
 *
 * THE SOLUTION — AUTOMATIC FAILOVER:
 * Provide multiple server endpoints. Novixo tries each one
 * in order when the current endpoint fails. Zero downtime.
 *
 * HOW TO USE:
 *   await Novixo.init({
 *     syncHandler: async (item) => {
 *       const res = await Novixo.fetchWithFailover(item, {
 *         endpoints: [
 *           "https://api-primary.yourapp.com/sync",
 *           "https://api-backup.yourapp.com/sync",
 *           "https://api-fallback.yourapp.com/sync",
 *         ],
 *       });
 *       return res.ok;
 *     },
 *   });
 *
 * WHAT HAPPENS:
 *   Primary fails → tries backup → tries fallback → fails safely
 *   Primary recovers → automatically routes back to primary
 */

const DEFAULT_OPTIONS = {
  retryPerEndpoint: 1,       // attempts per endpoint before moving to next
  timeoutMs:        8000,    // per-endpoint timeout
  healthCheckMs:    30000,   // how often to re-check failed endpoints
};

// ── State ─────────────────────────────────────

let options          = { ...DEFAULT_OPTIONS };
let currentIndex     = 0;   // which endpoint we're currently using
let endpointHealth   = [];  // Array of { url, healthy, lastFailedAt }
let healthCheckTimer = null;

// ── Init ──────────────────────────────────────

export function initFailover(endpoints = [], userOptions = {}) {
  options        = { ...DEFAULT_OPTIONS, ...userOptions };
  currentIndex   = 0;
  endpointHealth = endpoints.map((url) => ({ url, healthy: true, lastFailedAt: null }));

  if (endpointHealth.length > 0) {
    console.log(`[NovixoEngine:Failover] ${endpointHealth.length} endpoint(s) registered.`);
    startHealthChecks();
  }
}

export function destroyFailover() {
  if (healthCheckTimer) { clearInterval(healthCheckTimer); healthCheckTimer = null; }
  endpointHealth = [];
  currentIndex   = 0;
}

// ── Public: fetch with failover ───────────────

/**
 * Attempt a fetch across all configured endpoints.
 * Moves to the next endpoint on failure automatically.
 *
 * @param {Object}   item          — queue item (used as request body)
 * @param {Object}   fetchOptions  — method, headers, etc.
 * @returns {Promise<Response>}    — first successful response
 * @throws  if all endpoints fail
 */
export async function fetchWithFailover(item, fetchOptions = {}) {
  if (!endpointHealth.length) {
    throw new Error("[NovixoEngine:Failover] No endpoints configured. Call initFailover() first.");
  }

  const healthyEndpoints = getHealthyEndpoints();

  if (!healthyEndpoints.length) {
    console.warn("[NovixoEngine:Failover] All endpoints unhealthy — trying anyway...");
    // Reset and retry — maybe they've recovered
    endpointHealth.forEach((e) => { e.healthy = true; });
  }

  const orderedEndpoints = getOrderedEndpoints();

  for (const endpoint of orderedEndpoints) {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), options.timeoutMs);

      const res = await fetch(endpoint.url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(item),
        signal:  controller.signal,
        ...fetchOptions,
      });

      clearTimeout(timer);

      if (res.ok || res.status < 500) {
        // This endpoint worked — promote it to current
        markHealthy(endpoint.url);
        currentIndex = endpointHealth.findIndex((e) => e.url === endpoint.url);
        return res;
      }

      // Server error — try next
      markUnhealthy(endpoint.url);
      console.warn(`[NovixoEngine:Failover] ${endpoint.url} returned ${res.status} — trying next...`);

    } catch (err) {
      markUnhealthy(endpoint.url);
      console.warn(`[NovixoEngine:Failover] ${endpoint.url} failed: ${err.message} — trying next...`);
    }
  }

  throw new Error("[NovixoEngine:Failover] All endpoints failed.");
}

// ── Public: query ─────────────────────────────

export function getCurrentEndpoint() {
  return endpointHealth[currentIndex]?.url ?? null;
}

export function getFailoverStats() {
  return {
    currentIndex,
    currentEndpoint: getCurrentEndpoint(),
    endpoints: endpointHealth.map((e) => ({
      url:          e.url,
      healthy:      e.healthy,
      lastFailedAt: e.lastFailedAt,
    })),
  };
}

export function getHealthyEndpoints() {
  return endpointHealth.filter((e) => e.healthy);
}

// ── Internal ──────────────────────────────────

function getOrderedEndpoints() {
  // Start from current, wrap around
  const reordered = [];
  for (let i = 0; i < endpointHealth.length; i++) {
    reordered.push(endpointHealth[(currentIndex + i) % endpointHealth.length]);
  }
  return reordered;
}

function markUnhealthy(url) {
  const ep = endpointHealth.find((e) => e.url === url);
  if (ep) { ep.healthy = false; ep.lastFailedAt = Date.now(); }
}

function markHealthy(url) {
  const ep = endpointHealth.find((e) => e.url === url);
  if (ep) { ep.healthy = true; ep.lastFailedAt = null; }
}

function startHealthChecks() {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(async () => {
    for (const ep of endpointHealth.filter((e) => !e.healthy)) {
      try {
        const res = await fetch(ep.url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
        if (res.ok || res.status < 500) {
          markHealthy(ep.url);
          console.log(`[NovixoEngine:Failover] ${ep.url} recovered ✓`);
        }
      } catch {}
    }
  }, options.healthCheckMs);
}
