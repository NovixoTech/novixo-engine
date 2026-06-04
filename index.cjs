/**
 * index.cjs — Novixo Engine
 * ──────────────────────────
 * CommonJS entry point.
 * For developers using require() in Node.js environments.
 *
 * Usage:
 *   const { default: Novixo, Priority, NetworkState } = require("novixo-engine");
 *
 * Note: This is a thin compatibility shim.
 * The real logic lives in the ES module (index.js).
 * For best results, use ES modules (import) wherever possible.
 */

"use strict";

// Dynamic import bridge — loads ES module from CommonJS context
let _module = null;

async function loadModule() {
  if (!_module) {
    _module = await import("./index.js");
  }
  return _module;
}

// Proxy object — forwards all calls to the ES module
const NovixoProxy = {
  async init(config) {
    const m = await loadModule();
    return m.default.init(config);
  },
  async send(data, priority) {
    const m = await loadModule();
    return m.default.send(data, priority);
  },
  async syncNow() {
    const m = await loadModule();
    return m.default.syncNow();
  },
  isOnline() {
    if (!_module) return true;
    return _module.default.isOnline();
  },
  getNetworkState() {
    if (!_module) return "OFFLINE";
    return _module.default.getNetworkState();
  },
  getQueue() {
    if (!_module) return [];
    return _module.default.getQueue();
  },
  queueSize() {
    if (!_module) return 0;
    return _module.default.queueSize();
  },
  async clearQueue() {
    const m = await loadModule();
    return m.default.clearQueue();
  },
  forceNetworkState(state) {
    if (_module) _module.default.forceNetworkState(state);
  },
  destroy() {
    if (_module) _module.default.destroy();
  },
};

// Named exports
const Priority = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

const NetworkState = {
  STABLE: "STABLE",
  DEGRADED: "DEGRADED",
  UNSTABLE: "UNSTABLE",
  OFFLINE: "OFFLINE",
};

const ConflictStrategy = {
  LAST_WRITE_WINS: "LAST_WRITE_WINS",
  CLIENT_WINS: "CLIENT_WINS",
  SERVER_WINS: "SERVER_WINS",
  MANUAL: "MANUAL",
};

module.exports = {
  default: NovixoProxy,
  Priority,
  NetworkState,
  ConflictStrategy,
};

