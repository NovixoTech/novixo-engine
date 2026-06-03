# Novixo Sync

> **Offline-first sync engine for web and mobile apps.**
> Queue offline. Sync smart. Resolve conflicts automatically.

---

## Project Structure

```
novixo-sync/
  ├── src/
  │   ├── adapters/
  │   │   ├── indexeddb.adapter.js        → Web (IndexedDB)
  │   │   └── asyncstorage.adapter.js     → Mobile (AsyncStorage)
  │   ├── storage.js      → Smart adapter router
  │   ├── queue.js        → Offline action queue
  │   ├── network.js      → Online/offline detection
  │   ├── core.js         → Brain: store, send, retry, resolve
  │   └── conflict.js     → Conflict resolution engine (Phase 3 ✅)
  ├── demo/
  │   └── NovixoDemo.jsx  → Expo demo screen
  ├── index.js            → Public SDK entry point
  └── package.json
```

---

## Conflict Resolution (Phase 3)

A conflict happens when the same data was changed in two places while one side was offline.

### The 4 strategies

| Strategy | Who wins | Best for |
|---|---|---|
| `LAST_WRITE_WINS` | Newest timestamp | Most apps (default) |
| `CLIENT_WINS` | Local / offline version | Personal data, notes, settings |
| `SERVER_WINS` | Server version | Shared data, collaborative docs |
| `MANUAL` | You decide via callback | Complex business logic |

---

## Quick Start

### Basic (Last Write Wins — default)
```js
import Novixo from "novixo-sync";

await Novixo.init({
  syncHandler: async (item) => {
    const res = await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify(item),
    });

    // Signal a conflict if server returns 409
    if (res.status === 409) {
      const serverItem = await res.json();
      return { conflict: true, serverItem };
    }

    return res.ok;
  },
});
```

### Choose a strategy
```js
import Novixo, { ConflictStrategy } from "novixo-sync";

await Novixo.init({
  conflictStrategy: ConflictStrategy.CLIENT_WINS,

  syncHandler: async (item) => { ... },

  onConflictResolved: (resolvedItem, strategy) => {
    console.log(`Resolved via ${strategy}:`, resolvedItem);
  },
});
```

### Manual resolution (you decide)
```js
await Novixo.init({
  conflictStrategy: ConflictStrategy.MANUAL,

  syncHandler: async (item) => { ... },

  // Your custom resolver — gets both versions, you return the winner
  onConflict: async (clientItem, serverItem) => {
    // Example: merge both payloads
    return {
      ...clientItem,
      payload: { ...serverItem.payload, ...clientItem.payload },
    };
  },
});
```

### Mobile (React Native / Expo)
```js
await Novixo.init({
  platform: "mobile",
  conflictStrategy: ConflictStrategy.SERVER_WINS,
  syncHandler: async (item) => { ... },
});
```

---

## How your server signals a conflict

Your backend should return HTTP `409 Conflict` with the server's version of the item:

```js
// Express example
app.post("/api/sync", async (req, res) => {
  const incoming = req.body;
  const existing = await db.find(incoming.id);

  if (existing && existing.timestamp > incoming.timestamp) {
    // Conflict — server has newer data
    return res.status(409).json(existing);
  }

  await db.save(incoming);
  res.status(200).json({ ok: true });
});
```

---

## API Reference

| Method | Description |
|---|---|
| `await Novixo.init(config)` | Initialize SDK |
| `await Novixo.send(data)` | Queue item (sends immediately if online) |
| `await Novixo.syncNow()` | Manually trigger queue sync |
| `Novixo.isOnline()` | Current network status |
| `Novixo.getQueue()` | All queued items |
| `Novixo.queueSize()` | Queue size |
| `await Novixo.clearQueue()` | Clear all queued items |
| `Novixo.destroy()` | Teardown SDK |

### init() config options (Phase 3)

| Option | Type | Default | Description |
|---|---|---|---|
| `syncHandler` | `async fn` | **required** | Returns `true`, `false`, or `{ conflict, serverItem }` |
| `conflictStrategy` | `string` | `LAST_WRITE_WINS` | One of the 4 strategies |
| `onConflict` | `async fn` | `null` | Required if strategy = `MANUAL` |
| `onConflictResolved` | `fn` | `null` | Called after every conflict resolution |
| `platform` | `string` | auto | `"web"` or `"mobile"` |
| `retryLimit` | `number` | `5` | Max retries per item |
| `retryDelay` | `number` | `3000` | ms between retry sweeps |
| `autoSync` | `boolean` | `true` | Auto-sync when back online |
| `onSyncSuccess` | `fn` | `null` | Called on successful sync |
| `onSyncFailure` | `fn` | `null` | Called on failure |
| `onQueueChange` | `fn` | `null` | Called when queue size changes |

---

## Roadmap

- [x] Phase 1.1 — Offline queue engine
- [x] Phase 1.2 — Network detection
- [x] Phase 1.3 — Auto-retry + sync sweep
- [x] Phase 1.4 — IndexedDB support (web)
- [x] Phase 2   — React Native / Expo adapter
- [x] Phase 3   — Conflict resolution strategies
- [ ] Phase 4   — npm package + CDN release

---

## License

MIT © Novixo
