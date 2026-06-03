/**
 * conflict.js — Novixo Sync (Phase 3)
 * ─────────────────────────────────────────────────────
 * Conflict Resolution Engine.
 *
 * WHAT IS A CONFLICT?
 * A conflict happens when the same data was changed in two places
 * while one side was offline. When both try to sync — who wins?
 *
 * Example:
 *   - User A edits their profile offline → "Name: John"
 *   - Server already has               → "Name: Jonathan"
 *   - Both try to save — which is correct?
 *
 * Novixo supports 3 strategies developers can choose from:
 *
 *   1. LAST_WRITE_WINS  — newest timestamp wins (default)
 *   2. CLIENT_WINS      — local (offline) version always wins
 *   3. SERVER_WINS      — server version always wins
 *   4. MANUAL           — developer decides via callback
 *
 * ─────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────
// Strategy constants — use these in your config
// ─────────────────────────────────────────────

export const ConflictStrategy = {
  LAST_WRITE_WINS: "LAST_WRITE_WINS",
  CLIENT_WINS: "CLIENT_WINS",
  SERVER_WINS: "SERVER_WINS",
  MANUAL: "MANUAL",
};

// ─────────────────────────────────────────────
// STRATEGY 1: Last Write Wins
// Compares timestamps — newest data wins.
// Best for: most apps, simple data
// ─────────────────────────────────────────────

/**
 * @param {Object} clientItem  — item from the local queue
 * @param {Object} serverItem  — item returned from the server (conflict response)
 * @returns {Object} the winning item
 */
function lastWriteWins(clientItem, serverItem) {
  const clientTime = clientItem.timestamp || 0;
  const serverTime = serverItem.timestamp || 0;

  if (clientTime >= serverTime) {
    console.log(`[NovixoSync:Conflict] LAST_WRITE_WINS → client wins (${clientTime} >= ${serverTime})`);
    return clientItem;
  } else {
    console.log(`[NovixoSync:Conflict] LAST_WRITE_WINS → server wins (${serverTime} > ${clientTime})`);
    return serverItem;
  }
}

// ─────────────────────────────────────────────
// STRATEGY 2: Client Wins
// Local (offline) version always wins.
// Best for: personal data, notes, settings
// ─────────────────────────────────────────────

function clientWins(clientItem, _serverItem) {
  console.log(`[NovixoSync:Conflict] CLIENT_WINS → client version kept`);
  return clientItem;
}

// ─────────────────────────────────────────────
// STRATEGY 3: Server Wins
// Server version always wins. Client change is discarded.
// Best for: shared data, collaborative documents
// ─────────────────────────────────────────────

function serverWins(_clientItem, serverItem) {
  console.log(`[NovixoSync:Conflict] SERVER_WINS → server version kept`);
  return serverItem;
}

// ─────────────────────────────────────────────
// MAIN: Resolve a conflict
// Called by core.js when server returns a conflict signal
// ─────────────────────────────────────────────

/**
 * Resolve a conflict between a local queued item and a server version.
 *
 * @param {Object} clientItem       — the local queued item
 * @param {Object} serverItem       — the server's version of the same data
 * @param {string} strategy         — one of ConflictStrategy values
 * @param {Function} manualResolver — required if strategy is MANUAL
 *                                    async (clientItem, serverItem) => resolvedItem
 * @returns {Promise<Object>}       — the resolved item to use
 */
export async function resolveConflict(
  clientItem,
  serverItem,
  strategy = ConflictStrategy.LAST_WRITE_WINS,
  manualResolver = null
) {
  console.log(`[NovixoSync:Conflict] Resolving conflict for item [${clientItem.id}] — strategy: ${strategy}`);

  switch (strategy) {
    case ConflictStrategy.LAST_WRITE_WINS:
      return lastWriteWins(clientItem, serverItem);

    case ConflictStrategy.CLIENT_WINS:
      return clientWins(clientItem, serverItem);

    case ConflictStrategy.SERVER_WINS:
      return serverWins(clientItem, serverItem);

    case ConflictStrategy.MANUAL:
      if (!manualResolver || typeof manualResolver !== "function") {
        console.error(
          "[NovixoSync:Conflict] MANUAL strategy requires an onConflict(clientItem, serverItem) callback in your config."
        );
        // Fall back to LAST_WRITE_WINS if no resolver provided
        return lastWriteWins(clientItem, serverItem);
      }
      try {
        const resolved = await manualResolver(clientItem, serverItem);
        console.log(`[NovixoSync:Conflict] MANUAL → resolved by developer`);
        return resolved;
      } catch (e) {
        console.error("[NovixoSync:Conflict] MANUAL resolver threw an error:", e);
        return lastWriteWins(clientItem, serverItem);
      }

    default:
      console.warn(`[NovixoSync:Conflict] Unknown strategy "${strategy}" — falling back to LAST_WRITE_WINS`);
      return lastWriteWins(clientItem, serverItem);
  }
}

// ─────────────────────────────────────────────
// HELPER: Detect if a server response is a conflict
// Developers signal conflicts by returning { conflict: true, serverItem: {...} }
// from their syncHandler
// ─────────────────────────────────────────────

/**
 * Check if a syncHandler response signals a conflict
 * @param {any} response — value returned by syncHandler
 * @returns {boolean}
 */
export function isConflict(response) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.conflict === true &&
    response.serverItem !== undefined
  );
}
