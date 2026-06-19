/**
 * queue.js — Novixo Sync (Phase 1.4)
 * ─────────────────────────────────────
 * Updated to use async IndexedDB storage instead of localStorage.
 * Logic is identical to Phase 1.3 — only storage calls are now awaited.
 */

import { saveLocal, loadLocal } from "./storage.js";

const STORAGE_KEY = "novixo_queue";

let queue = [];

/**
 * Load persisted queue from IndexedDB
 * Call once during SDK init.
 */
export async function loadQueue() {
  try {
    const saved = await loadLocal(STORAGE_KEY, []);
    queue = Array.isArray(saved) ? saved : [];
    console.log(`[NovixoSync] Queue loaded from IndexedDB — ${queue.length} item(s).`);
  } catch (e) {
    console.warn("[NovixoSync] Could not load queue from IndexedDB:", e);
    queue = [];
  }
}

/**
 * Persist current queue to IndexedDB
 */
async function persistQueue() {
  try {
    await saveLocal(STORAGE_KEY, queue);
  } catch (e) {
    console.warn("[NovixoSync] Could not persist queue:", e);
  }
}

/**
 * Add an item to the offline queue
 * @param {Object} item - { type, payload, timestamp?, id? }
 * @returns {Promise<string>} item ID
 */
export async function addToQueue(item) {
  const entry = {
    id: item.id || `novixo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: item.type || "generic",
    payload: item.payload || item,
    timestamp: item.timestamp || Date.now(),
    retries: 0,
    status: "pending",
  };

  queue.push(entry);
  await persistQueue();

  console.log(`[NovixoSync] Queued item [${entry.id}] — type: ${entry.type}`);
  return entry.id;
}

/**
 * Get all queued items
 * @returns {Array}
 */
export function getQueue() {
  return [...queue];
}

/**
 * Return a direct reference to the live queue array (not a copy)
 * @returns {Array}
 */
export function getQueueRef() {
  return queue;
}

/**
 * Get only pending items (not yet synced)
 * @returns {Array}
 */
export function getPendingItems() {
  return queue.filter((item) => item.status === "pending");
}

/**
 * Mark an item as synced and remove it from the queue
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function markSynced(id) {
  queue = queue.filter((item) => item.id !== id);
  await persistQueue();
  console.log(`[NovixoSync] Item [${id}] synced and removed from queue.`);
}

/**
 * Mark an item as failed and increment its retry count
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function markFailed(id) {
  queue = queue.map((item) =>
    item.id === id
      ? { ...item, retries: item.retries + 1, status: "failed" }
      : item
  );
  await persistQueue();
}

/**
 * Reset all failed items back to "pending" for the next retry sweep
 * @returns {Promise<void>}
 */
export async function resetFailed() {
  queue = queue.map((item) =>
    item.status === "failed" ? { ...item, status: "pending" } : item
  );
  await persistQueue();
}

/**
 * Clear the entire queue
 * @returns {Promise<void>}
 */
export async function clearQueue() {
  queue = [];
  await persistQueue();
  console.log("[NovixoSync] Queue cleared.");
}

/**
 * Return current queue size
 * @returns {number}
 */
export function queueSize() {
  return queue.length;
}

/**
 * Return a direct reference to the live queue array (not a copy)
 * @returns {Array}
 */
export function getQueueRef() {
  return queue;
}
