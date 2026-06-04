/**
 * priority-queue.js — Novixo Sync (Phase 4a)
 * ──────────────────────────────────────────────
 * Priority-aware queue layer.
 *
 * Not all data is equal. This module wraps the base queue
 * and ensures items sync in the right order:
 *
 *  🔴 HIGH   (3) — payments, auth, critical actions → sync FIRST
 *  🟡 MEDIUM (2) — messages, form submissions → sync normally
 *  🟢 LOW    (1) — analytics, logs, non-critical → sync LAST
 *
 * WHY THIS MATTERS:
 * On a weak network, you can't send everything at once.
 * Novixo ensures a payment always goes before an analytics ping.
 * This is what makes the SDK feel "intelligent" vs a dumb queue.
 */

// ─────────────────────────────────────────────
// Priority constants
// ─────────────────────────────────────────────

export const Priority = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

// Internal numeric weight for sorting
const PRIORITY_WEIGHT = {
  [Priority.HIGH]: 3,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 1,
};

// ─────────────────────────────────────────────
// PUBLIC: Attach priority to a queue item
// ─────────────────────────────────────────────

/**
 * Enrich a raw data object with a priority level.
 * Called inside send() before addToQueue().
 *
 * @param {Object} data       — the item payload
 * @param {string} priority   — Priority.HIGH | MEDIUM | LOW
 * @returns {Object}          — data with priority attached
 */
export function withPriority(data, priority = Priority.MEDIUM) {
  const normalized = normalizePriority(priority);
  return {
    ...data,
    priority: normalized,
    priorityWeight: PRIORITY_WEIGHT[normalized],
  };
}

/**
 * Normalize priority input — accepts string variants
 * "high", "HIGH", "High" all map to Priority.HIGH
 * Unknown values fall back to MEDIUM
 */
export function normalizePriority(priority) {
  if (!priority) return Priority.MEDIUM;

  const upper = String(priority).toUpperCase().trim();

  if (upper === "HIGH")   return Priority.HIGH;
  if (upper === "MEDIUM") return Priority.MEDIUM;
  if (upper === "LOW")    return Priority.LOW;

  console.warn(
    `[NovixoSync:Priority] Unknown priority "${priority}" — defaulting to MEDIUM`
  );
  return Priority.MEDIUM;
}

// ─────────────────────────────────────────────
// PUBLIC: Sort queue items by priority
// ─────────────────────────────────────────────

/**
 * Sort an array of queue items by priority (HIGH first).
 * Within the same priority, older items go first (FIFO).
 *
 * @param {Array} items — array of queue items
 * @returns {Array}     — sorted copy (does not mutate original)
 */
export function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const weightA = a.priorityWeight ?? PRIORITY_WEIGHT[Priority.MEDIUM];
    const weightB = b.priorityWeight ?? PRIORITY_WEIGHT[Priority.MEDIUM];

    // Higher weight first
    if (weightB !== weightA) return weightB - weightA;

    // Same priority → older timestamp first (FIFO)
    return (a.timestamp ?? 0) - (b.timestamp ?? 0);
  });
}

// ─────────────────────────────────────────────
// PUBLIC: Filter queue by priority level
// ─────────────────────────────────────────────

/**
 * Get only HIGH priority items from a queue
 * @param {Array} items
 * @returns {Array}
 */
export function getHighPriorityItems(items) {
  return items.filter((i) => i.priority === Priority.HIGH);
}

/**
 * Get items at or above a minimum priority level
 * @param {Array} items
 * @param {string} minPriority — items at this level and above
 * @returns {Array}
 */
export function getItemsAbovePriority(items, minPriority) {
  const minWeight = PRIORITY_WEIGHT[normalizePriority(minPriority)] ?? 1;
  return items.filter(
    (i) => (i.priorityWeight ?? PRIORITY_WEIGHT[Priority.MEDIUM]) >= minWeight
  );
}

// ─────────────────────────────────────────────
// PUBLIC: Describe priority (for logging/UI)
// ─────────────────────────────────────────────

export function describePriority(priority) {
  switch (priority) {
    case Priority.HIGH:   return "🔴 HIGH";
    case Priority.MEDIUM: return "🟡 MEDIUM";
    case Priority.LOW:    return "🟢 LOW";
    default:              return "🟡 MEDIUM";
  }
}
