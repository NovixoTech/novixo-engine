/**
 * cache.js — Novixo Engine (Phase 7f)
 * Response Cache System.
 *
 * THE PROBLEM:
 * Every network request costs time, data, and money.
 * Apps repeatedly fetch the same data — user profile,
 * product list, configuration — over and over.
 *
 * On slow/expensive networks this is painful and costly.
 *
 * THE SOLUTION:
 * Cache responses locally. Serve from cache when:
 *   - Network is slow/offline
 *   - Data hasn't expired (TTL)
 *   - Developer explicitly requests cached version
 *
 * HOW TO USE:
 *   import { cacheGet, cacheSet, cacheFetch } from "novixo-engine";
 *
 *   // Cache a fetch response automatically
 *   const data = await Novixo.cacheFetch("/api/user/profile", {
 *     ttl: 5 * 60 * 1000, // 5 minutes
 *   });
 *
 *   // Manual cache set/get
 *   await Novixo.cacheSet("user_profile", data, 300000);
 *   const cached = await Novixo.cacheGet("user_profile");
 */

import { saveLocal, loadLocal } from "./storage.js";

const CACHE_STORE_KEY = "novixo_cache";
const DEFAULT_TTL     = 5 * 60 * 1000; // 5 minutes

// In-memory cache layer (faster than IndexedDB for reads)
let memoryCache = new Map(); // key → { value, expiresAt }

// ── Init ──────────────────────────────────────

export async function initCache() {
  try {
    const saved = await loadLocal(CACHE_STORE_KEY, {});
    const now   = Date.now();

    // Load non-expired entries into memory
    for (const [key, entry] of Object.entries(saved)) {
      if (entry.expiresAt > now) {
        memoryCache.set(key, entry);
      }
    }

    console.log(`[NovixoEngine:Cache] Loaded ${memoryCache.size} cached item(s) ✓`);
  } catch {
    memoryCache = new Map();
  }
}

// ── Set ───────────────────────────────────────

/**
 * Store a value in the cache.
 * @param {string} key
 * @param {any}    value
 * @param {number} ttlMs — time to live in milliseconds (default 5 min)
 */
export async function cacheSet(key, value, ttlMs = DEFAULT_TTL) {
  const entry = { value, expiresAt: Date.now() + ttlMs, cachedAt: Date.now() };
  memoryCache.set(key, entry);
  await persistCache();
}

// ── Get ───────────────────────────────────────

/**
 * Retrieve a value from cache.
 * Returns null if not found or expired.
 * @param {string} key
 * @returns {any|null}
 */
export function cacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Check if a key exists and is not expired.
 * @param {string} key
 * @returns {boolean}
 */
export function cacheHas(key) {
  return cacheGet(key) !== null;
}

// ── cacheFetch ────────────────────────────────

/**
 * Fetch a URL and cache the response automatically.
 * On cache hit → returns cached data immediately (no network call).
 * On cache miss → fetches, caches, returns.
 * On offline + cache hit → returns cached data.
 * On offline + no cache → throws error.
 *
 * @param {string} url
 * @param {Object} options
 * @param {number} options.ttl          — cache TTL in ms (default 5 min)
 * @param {Object} options.fetchOptions — passed to fetch()
 * @param {boolean} options.forceRefresh — ignore cache, always fetch
 * @returns {Promise<any>}
 */
export async function cacheFetch(url, options = {}) {
  const { ttl = DEFAULT_TTL, fetchOptions = {}, forceRefresh = false } = options;
  const cacheKey = `fetch:${url}`;

  // Return cached if available and not force-refreshing
  if (!forceRefresh) {
    const cached = cacheGet(cacheKey);
    if (cached !== null) {
      console.log(`[NovixoEngine:Cache] Hit: ${url}`);
      return cached;
    }
  }

  // Fetch from network
  const res  = await fetch(url, fetchOptions);
  if (!res.ok) throw new Error(`[NovixoEngine:Cache] Fetch failed: ${res.status} ${url}`);

  const data = await res.json();
  await cacheSet(cacheKey, data, ttl);
  console.log(`[NovixoEngine:Cache] Cached: ${url} (TTL: ${ttl}ms)`);
  return data;
}

// ── Delete / Clear ────────────────────────────

export async function cacheDelete(key) {
  memoryCache.delete(key);
  await persistCache();
}

export async function cacheClear() {
  memoryCache.clear();
  await persistCache();
  console.log("[NovixoEngine:Cache] Cleared.");
}

// ── Stats ─────────────────────────────────────

export function getCacheStats() {
  const now     = Date.now();
  const entries = Array.from(memoryCache.entries());
  const active  = entries.filter(([, e]) => e.expiresAt > now);
  const expired = entries.length - active.length;

  return {
    totalEntries:   entries.length,
    activeEntries:  active.length,
    expiredEntries: expired,
    keys:           active.map(([k]) => k),
  };
}

// ── Internal ──────────────────────────────────

async function persistCache() {
  const now = Date.now();
  const obj = {};

  // Only persist non-expired entries
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt > now) obj[key] = entry;
  }

  await saveLocal(CACHE_STORE_KEY, obj);
}
