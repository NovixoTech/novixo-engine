# novixo-engine

> **An adaptive network intelligence engine for modern applications.**

[![npm version](https://img.shields.io/npm/v/novixo-engine.svg)](https://www.npmjs.com/package/novixo-engine)
[![license](https://img.shields.io/npm/l/novixo-engine.svg)](./LICENSE)

---

## The problem

Most apps treat the network as binary — online or offline.

But real-world networks are unpredictable. They degrade, flap, drop packets, and recover. On mobile especially, "connected" doesn't mean "working."

**Novixo Engine adapts to 4 real-world network states automatically.**

---

## Install

```bash
npm install novixo-engine
```

For React Native / Expo:
```bash
expo install @react-native-async-storage/async-storage
```

---

## Quick start

```js
import Novixo, { Priority } from "novixo-engine";

await Novixo.init({
  syncHandler: async (item) => {
    const res = await fetch("https://your-api.com/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return res.ok;
  },

  onNetworkStateChange: (newState, oldState) => {
    console.log(`Network: ${oldState} → ${newState}`);
  },

  onSyncSuccess: (item) => console.log("✅ Synced:", item.id),
  onQueueChange: (size) => console.log("📦 Queue:", size),
});

// Payments — always sync first
await Novixo.send({ type: "payment", payload: { amount: 5000 } }, Priority.HIGH);

// Messages — default priority
await Novixo.send({ type: "message", payload: { text: "Hello" } });

// Analytics — sync last, skip on weak networks
await Novixo.send({ type: "analytics", payload: { event: "tap" } }, Priority.LOW);
```

---

## 4-State network intelligence

| State | Meaning | What Novixo does |
|---|---|---|
| `STABLE` | Fast, reliable | Send immediately |
| `DEGRADED` | Slow or inconsistent | Batch into groups |
| `UNSTABLE` | Frequent failures | HIGH priority only |
| `OFFLINE` | No connection | Store locally |

```js
import { NetworkState } from "novixo-engine";

console.log(Novixo.getNetworkState());
// "STABLE" | "DEGRADED" | "UNSTABLE" | "OFFLINE"
```

---

## Priority system

```js
import { Priority } from "novixo-engine";

// 🔴 HIGH — payments, auth, critical actions
await Novixo.send(data, Priority.HIGH);

// 🟡 MEDIUM — messages, updates (default)
await Novixo.send(data);

// 🟢 LOW — analytics, logs (last to sync, held on weak networks)
await Novixo.send(data, Priority.LOW);
```

---

## Batch sync

On degraded or unstable networks, Novixo automatically batches items to reduce API calls. Provide a `batchSyncHandler` to handle them:

```js
await Novixo.init({
  batchSyncHandler: async (items) => {
    const res = await fetch("/api/sync/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    const { results } = await res.json();
    return results; // [true, false, true, ...]
  },
  syncHandler: async (item) => { ... }, // single-item fallback
});
```

---

## Conflict resolution

```js
import { ConflictStrategy } from "novixo-engine";

await Novixo.init({
  conflictStrategy: ConflictStrategy.CLIENT_WINS,
  // Options: LAST_WRITE_WINS (default) | CLIENT_WINS | SERVER_WINS | MANUAL

  syncHandler: async (item) => {
    const res = await fetch("/api/sync", { ... });
    if (res.status === 409) {
      return { conflict: true, serverItem: await res.json() };
    }
    return res.ok;
  },
});
```

---

## React Native / Expo

```js
await Novixo.init({
  platform: "mobile",  // Uses AsyncStorage instead of IndexedDB
  syncHandler: async (item) => { ... },
});
```

---

## Testing

```js
import { NetworkState } from "novixo-engine";

// Simulate different network conditions
Novixo.forceNetworkState(NetworkState.DEGRADED);
Novixo.forceNetworkState(NetworkState.OFFLINE);
Novixo.forceNetworkState(NetworkState.STABLE);
```

---

## Full API

| Method | Description |
|---|---|
| `await Novixo.init(config)` | Initialize the engine |
| `await Novixo.send(data, priority?)` | Queue item with optional priority |
| `await Novixo.syncNow()` | Manually trigger sync |
| `Novixo.getNetworkState()` | Current 4-state network status |
| `Novixo.isOnline()` | True if not OFFLINE |
| `Novixo.forceNetworkState(state)` | Override state (for testing) |
| `Novixo.getQueue()` | All queued items |
| `Novixo.queueSize()` | Number of items in queue |
| `await Novixo.clearQueue()` | Clear all items |
| `Novixo.destroy()` | Teardown engine |

---

## CDN (no install needed)

```html
<script type="module">
  import Novixo from "https://unpkg.com/novixo-engine@1.0.0/index.js";
  await Novixo.init({ ... });
</script>
```

---

## License

MIT © [Novixo](https://github.com/YOUR_USERNAME)
