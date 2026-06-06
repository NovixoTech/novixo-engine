/**
 * ordered-queue.js — Novixo Engine (Phase 7e)
 * Ordered Execution — Dependency-Aware Queue.
 *
 * THE PROBLEM FOR DELIVERY AND MULTI-STEP APPS:
 * Delivery driver goes offline. While offline:
 *   Step 1: Accept order
 *   Step 2: Mark picked up
 *   Step 3: Mark delivered
 *
 * Naive queue sends them out of order: 3 → 1 → 2 ❌
 *
 * HOW TO USE:
 *   const id1 = await Novixo.send({ type: "accept_order", ... });
 *   const id2 = await Novixo.send({ type: "pickup", dependsOn: [id1], ... });
 *   const id3 = await Novixo.send({ type: "deliver", dependsOn: [id2], ... });
 *
 * id2 waits for id1. id3 waits for id2. Order always preserved ✓
 */

let confirmedIds = new Set();

export function initOrderedQueue()  { confirmedIds = new Set(); }
export function resetOrderedQueue() { confirmedIds = new Set(); }
export function confirmItem(id)     { confirmedIds.add(id); }

export function areDependenciesMet(item) {
  const deps = item.dependsOn ?? item._dependsOn ?? [];
  if (!deps.length) return true;
  const unmet = deps.filter((id) => !confirmedIds.has(id));
  if (unmet.length > 0) {
    console.log(`[NovixoEngine:OrderedQueue] [${item.id}] waiting for: [${unmet.join(", ")}]`);
    return false;
  }
  return true;
}

export function getReadyItems(items)   { return items.filter((i) => areDependenciesMet(i)); }
export function getWaitingItems(items) { return items.filter((i) => !areDependenciesMet(i)); }

export function sortByDependencies(items) {
  return [...getReadyItems(items), ...getWaitingItems(items)];
}

export function getOrderedQueueStats() {
  return { confirmedCount: confirmedIds.size, confirmedIds: Array.from(confirmedIds) };
}
