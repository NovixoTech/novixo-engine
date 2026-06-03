# Novixo Sync

> **Offline-first sync engine for web and mobile apps.**
> Queue actions when offline. Sync automatically when back online.

---

## What is Novixo Sync?

Novixo Sync is the **core infrastructure layer** that makes your app work reliably — even without internet.

When a user is offline:
- Their actions (messages, form submissions, data updates) are **queued locally**
- Nothing is lost

When they come back online:
- The queue **syncs automatically**
- Your app picks up exactly where it left off

---

## Project Structure

```
novixo-sync/
  ├── src/
  │   ├── queue.js      → Stores offline actions
  │   ├── network.js    → Detects online/offline
  │   ├── storage.js    → Local persistence (localStorage)
  │   └── core.js       → Brain: decides what to store, send, retry
  ├── index.js          → Public SDK entry point
  ├── package.json
  └── README.md
```

---

## Quick Start

```js
import Novixo from "novixo-sync";

// 1. Initialize with YOUR sync logic
Novixo.init({
  syncHandler: async (item) => {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return res.ok; // return true = success, false = retry later
  },

  onSyncSuccess: (item) => console.log("✅ Synced:", item.id),
  onSyncFailure: (item, err) => console.warn("❌ Failed:", item.id, err),
  onQueueChange: (size) => console.log("Queue size:", size),
});

// 2. Send data — works online AND offline
await Novixo.send({
  type: "message",
  payload: { text: "Hello from offline!", userId: "u_123" },
});

// 3. Manually sync if needed
await Novixo.syncNow();

// 4. Check status
console.log("Online?", Novixo.isOnline());
console.log("Queue:", Novixo.getQueue());
```

---

## API Reference

| Method | Description |
|---|---|
| `Novixo.init(config)` | Initialize the SDK |
| `Novixo.send(data)` | Queue an item (sends immediately if online) |
| `Novixo.syncNow()` | Manually trigger queue sync |
| `Novixo.isOnline()` | Returns current network status |
| `Novixo.getQueue()` | Get all queued items |
| `Novixo.queueSize()` | Get number of items in queue |
| `Novixo.clearQueue()` | Clear all queued items |
| `Novixo.destroy()` | Teardown SDK (for testing) |

### `init(config)` Options

| Option | Type | Default | Description |
|---|---|---|---|
| `syncHandler` | `async fn` | **required** | Your function to send each item |
| `retryLimit` | `number` | `5` | Max retries per item |
| `retryDelay` | `number` | `3000` | ms between retry sweeps |
| `autoSync` | `boolean` | `true` | Auto-sync when back online |
| `onSyncSuccess` | `fn(item)` | `null` | Callback on successful sync |
| `onSyncFailure` | `fn(item, err)` | `null` | Callback on failure |
| `onQueueChange` | `fn(size)` | `null` | Callback when queue size changes |

---

## Roadmap

- [x] Phase 1.1 — Offline queue engine
- [x] Phase 1.2 — Network detection
- [x] Phase 1.3 — Auto-retry + sync sweep
- [ ] Phase 1.4 — IndexedDB support (larger storage)
- [ ] Phase 2 — React Native / mobile adapter
- [ ] Phase 3 — Conflict resolution strategies
- [ ] Phase 4 — npm package + CDN release

---

## License

MIT © Novixo
