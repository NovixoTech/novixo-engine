/**
 * queue-manager.js — Novixo Engine (Phase 6d)
 * ──────────────────────────────────────────────
 * Queue Cancel and Edit System.
 *
 * THE PROBLEM:
 * User sends a message while offline. Then changes their mind and
 * deletes it before reconnecting. Without this — the message still
 * syncs when the network returns. The user is confused and frustrated.
 *
 * Other real cases:
 *  - User edits a form submission before it syncs
 *  - User cancels a payment they queued
 *  - User updates their profile offline, then updates it again
 *
 * WHAT THIS MODULE DOES:
 *  cancelItem(id) — removes an item from the queue permanently
 *  updateItem(id, newData) — replaces an item's payload before sync
 *
 * BOTH operations work even when the item is pending sync.
 */

import { saveLocal, loadLocal } from "./storage.js";

const STORAGE_KEY = "novixo_queue";

// We need direct access to the in-memory queue from queue.js
// This module exports functions that operate on a queue reference
// injected by core.js at init time.

let _queueRef = null; // Reference to the live queue array in queue.js

/**
 * Inject the queue reference.
 * Called once by core.js after init.
 * @param {{ get: () => Array, set: (q: Array) => void, persist: () => Promise<void> }} ref
 */
export function injectQueueRef(ref) {
  _queueRef = ref;
}

// ─────────────────────────────────────────────
// PUBLIC: Cancel an item
// ─────────────────────────────────────────────

/**
 * Remove an item from the queue by ID.
 * Works on pending and failed items.
 * Does nothing if item not found or already synced.
 *
 * @param {string} id — item ID
 * @returns {Promise<boolean>} — true if cancelled, false if not found
 */
export async function cancelItem(id) {
  if (!_queueRef) {
    console.warn("[NovixoEngine:QueueManager] Queue not initialized.");
    return false;
  }

  const queue   = _queueRef.get();
  const index   = queue.findIndex((item) => item.id === id);

  if (index === -1) {
    console.warn(`[NovixoEngine:QueueManager] Item [${id}] not found in queue.`);
    return false;
  }

  // Remove from queue
  queue.splice(index, 1);
  await _queueRef.persist();

  console.log(`[NovixoEngine:QueueManager] Item [${id}] cancelled and removed from queue.`);
  return true;
}

// ─────────────────────────────────────────────
// PUBLIC: Update an item's payload
// ─────────────────────────────────────────────

/**
 * Update a queued item's data before it syncs.
 * Merges newData into the existing item — does not replace entirely.
 * Resets the item's status to "pending" so it will sync fresh.
 *
 * @param {string} id       — item ID
 * @param {Object} newData  — fields to update: { type?, payload?, priority? }
 * @returns {Promise<boolean>} — true if updated, false if not found
 */
export async function updateItem(id, newData) {
  if (!_queueRef) {
    console.warn("[NovixoEngine:QueueManager] Queue not initialized.");
    return false;
  }

  const queue = _queueRef.get();
  const index = queue.findIndex((item) => item.id === id);

  if (index === -1) {
    console.warn(`[NovixoEngine:QueueManager] Item [${id}] not found in queue.`);
    return false;
  }

  const existing = queue[index];

  // Merge new data into existing item
  queue[index] = {
    ...existing,
    ...newData,
    id,                           // Preserve original ID
    timestamp: existing.timestamp, // Preserve original timestamp
    retries:   0,                  // Reset retries — fresh attempt
    status:    "pending",          // Back to pending
  };

  await _queueRef.persist();

  console.log(`[NovixoEngine:QueueManager] Item [${id}] updated — will sync with new data.`);
  return true;
}

// ─────────────────────────────────────────────
// PUBLIC: Check if an item exists in queue
// ─────────────────────────────────────────────

/**
 * @param {string} id
 * @returns {boolean}
 */
export function hasItem(id) {
  if (!_queueRef) return false;
  return _queueRef.get().some((item) => item.id === id);
}

/**
 * Get a single item by ID
 * @param {string} id
 * @returns {Object|null}
 */
export function getItem(id) {
  if (!_queueRef) return null;
  return _queueRef.get().find((item) => item.id === id) ?? null;
}
