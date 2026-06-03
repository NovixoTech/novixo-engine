/**
 * network.js — Novixo Sync
 * Detects online/offline status and fires event callbacks.
 */

const listeners = {
  online: [],
  offline: [],
};

/**
 * Check current network status
 * @returns {boolean}
 */
export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Register a callback for network status changes
 * @param {"online"|"offline"} event
 * @param {Function} callback
 */
export function onNetworkChange(event, callback) {
  if (!listeners[event]) {
    console.warn(`[NovixoSync] Unknown network event: ${event}`);
    return;
  }
  listeners[event].push(callback);
}

/**
 * Fire all registered callbacks for an event
 * @param {"online"|"offline"} event
 */
function fireListeners(event) {
  listeners[event].forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.error(`[NovixoSync] Error in ${event} listener:`, e);
    }
  });
}

/**
 * Start listening to browser network events
 * Call this once during SDK init.
 */
export function startNetworkMonitor() {
  if (typeof window === "undefined") {
    console.warn("[NovixoSync] No browser window found. Network monitor skipped.");
    return;
  }

  window.addEventListener("online", () => {
    console.log("[NovixoSync] Network restored — online.");
    fireListeners("online");
  });

  window.addEventListener("offline", () => {
    console.log("[NovixoSync] Network lost — offline.");
    fireListeners("offline");
  });

  console.log(
    `[NovixoSync] Network monitor started. Current status: ${isOnline() ? "ONLINE" : "OFFLINE"}`
  );
}

/**
 * Remove all listeners (useful for cleanup/testing)
 */
export function clearNetworkListeners() {
  listeners.online = [];
  listeners.offline = [];
}
