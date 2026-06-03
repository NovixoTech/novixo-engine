/**
 * queue.js — Novixo Sync
 * Stores offline actions when network is unavailable.
 * Supports: messages, requests, updates
 */

const STORAGE_KEY = "novixo_queue";

let queue = [];

/**
 * Load persisted queue from localStorage (if available)
 */
export function loadQueue() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      queue = JSON.parse(saved);
    }
  } catch (e) {
    console.warn("[NovixoSync] Could not load queue from storage:", e);
    queue = [];
  }
}

/**
 * Persist queue to localStorage
 */
function persistQueue() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("[NovixoSync] Could not persist queue:", e);
  }
}

/**
 * Add an item to the offline queue
 * @param {Object} item - { type, payload, timestamp, id }
 */
export function addToQueue(item) {
  const entry = {
    id: item.id || `novixo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: item.type || "generic",
    payload: item.payload || item,
    timestamp: item.timestamp || Date.now(),
    retries: 0,
    status: "pending",
  };

  queue.push(entry);
  persistQueue();

  console.log(`[NovixoSync] Queued item [${entry.id}] — type: ${entry.type}`);
  return entry.id;
}

/**
 * Get all queued items
 */
export function getQueue() {
  return [...queue];
}

/**
 * Get only pending items (not yet synced)
 */
export function getPendingItems() {
  return queue.filter((item) => item.status === "pending");
}

/**
 * Mark an item as synced (remove from queue)
 * @param {string} id
 */
export function markSynced(id) {
  queue = queue.filter((item) => item.id !== id);
  persistQueue();
  console.log(`[NovixoSync] Item [${id}] synced and removed from queue.`);
}

/**
 * Mark an item as failed and increment retry count
 * @param {string} id
 */
export function markFailed(id) {
  queue = queue.map((item) => {
    if (item.id === id) {
      return { ...item, retries: item.retries + 1, status: "failed" };
    }
    return item;
  });
  persistQueue();
}

/**
 * Reset all failed items back to pending (for retry sweep)
 */
export function resetFailed() {
  queue = queue.map((item) =>
    item.status === "failed" ? { ...item, status: "pending" } : item
  );
  persistQueue();
}

/**
 * Clear the entire queue
 */
export function clearQueue() {
  queue = [];
  persistQueue();
  console.log("[NovixoSync] Queue cleared.");
}

/**
 * Return queue size
 */
export function queueSize() {
  return queue.length;
  }
