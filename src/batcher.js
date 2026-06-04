/**
 * batcher.js — Novixo Sync (Phase 4a)
 * ──────────────────────────────────────
 * Smart Request Batcher.
 *
 * On a weak or degraded network, sending 20 individual requests
 * is wasteful and likely to fail. Instead, Novixo batches them
 * into a single optimized payload — fewer round trips, less data.
 *
 * WHEN BATCHING IS USED:
 *  🟢 STABLE    → no batching, send items individually
 *  🟡 DEGRADED  → batch into groups of N
 *  🔴 UNSTABLE  → batch HIGH priority only, hold the rest
 *  ⚫ OFFLINE   → no sending, queue only
 *
 * WHAT A BATCH LOOKS LIKE:
 * Instead of: POST /sync (x20)
 * You send:   POST /sync/batch { items: [...20 items] }
 */

import { sortByPriority, getItemsAbovePriority, Priority } from "./priority-queue.js";

// ─────────────────────────────────────────────
// Batch config defaults
// ─────────────────────────────────────────────

const DEFAULT_BATCH_CONFIG = {
  maxBatchSize: 10,       // Max items per batch
  degradedBatchSize: 5,   // Smaller batches on degraded network
  unstableBatchSize: 3,   // Tiny batches (HIGH only) on unstable
};

// ─────────────────────────────────────────────
// PUBLIC: Create batches from a list of items
// ─────────────────────────────────────────────

/**
 * Split items into batches based on current network state.
 * Returns an array of batches — each batch is an array of items.
 *
 * @param {Array}  items        — queue items to batch
 * @param {string} networkState — current NetworkState value
 * @param {Object} batchConfig  — optional overrides
 * @returns {Array<Array>}      — array of batches
 */
export function createBatches(items, networkState, batchConfig = {}) {
  const cfg = { ...DEFAULT_BATCH_CONFIG, ...batchConfig };

  if (!items || items.length === 0) return [];

  switch (networkState) {
    case "STABLE": {
      // Send everything, individually (no batching needed)
      // Return each item as its own "batch of 1"
      return sortByPriority(items).map((item) => [item]);
    }

    case "DEGRADED": {
      // Batch into groups, priority-sorted
      const sorted = sortByPriority(items);
      return chunkArray(sorted, cfg.degradedBatchSize);
    }

    case "UNSTABLE": {
      // Only send HIGH priority items, in small batches
      const highOnly = getItemsAbovePriority(items, Priority.HIGH);
      const sorted = sortByPriority(highOnly);
      return chunkArray(sorted, cfg.unstableBatchSize);
    }

    case "OFFLINE":
    default:
      // Don't send anything
      return [];
  }
}

/**
 * Get IDs of items that are being held back (not in any batch).
 * Useful for logging — lets you know what's waiting.
 *
 * @param {Array} allItems    — full queue
 * @param {Array} batches     — batches returned by createBatches
 * @returns {Array<string>}   — IDs of held-back items
 */
export function getHeldBackIds(allItems, batches) {
  const batchedIds = new Set(
    batches.flat().map((item) => item.id)
  );
  return allItems
    .filter((item) => !batchedIds.has(item.id))
    .map((item) => item.id);
}

/**
 * Describe what will happen with this batch plan (for logging/debug)
 * @param {Array} batches
 * @param {string} networkState
 */
export function describeBatchPlan(batches, networkState) {
  const totalItems = batches.reduce((sum, b) => sum + b.length, 0);
  console.log(
    `[NovixoSync:Batcher] Network: ${networkState} | ` +
    `Batches: ${batches.length} | Items: ${totalItems}`
  );
}

// ─────────────────────────────────────────────
// INTERNAL: Split array into chunks of size n
// ─────────────────────────────────────────────

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
  }
