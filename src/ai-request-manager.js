/**
 * Novixo Engine - Phase 8: AI Request Manager
 * -------------------------------------------
 * Multi-provider AI request handling with:
 *  - Provider registration (priority-ordered)
 *  - Rate-limit detection per provider
 *  - Automatic failover to the next provider on rate-limit/error
 *  - Response caching (integration point for Phase 7f cache)
 *  - Offline queueing + ordered replay (integration point for Phase 7d/7e)
 *  - Event emitting (integration point for Phase 7g event system)
 *
 * Drop this file into your Novixo Engine source tree (e.g. src/phase8/ai-request-manager.js)
 * and wire `cache`, `queue`, and `emitter` to your existing Phase 7 modules if you want
 * shared state instead of the standalone implementations below.
 */

// ---------- Minimal EventEmitter (swap for your Phase 7g emitter if you have one) ----------
class SimpleEmitter {
  constructor() {
    this._listeners = {};
  }
  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return this;
  }
  off(event, fn) {
    if (!this._listeners[event]) return this;
    this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
    return this;
  }
  emit(event, payload) {
    (this._listeners[event] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        // Never let a listener crash the manager
        console.error(`[AIRequestManager] listener error on "${event}":`, err);
      }
    });
  }
}

// ---------- Minimal TTL cache (swap for your Phase 7f response cache if you have one) ----------
class SimpleCache {
  constructor() {
    this._store = new Map();
  }
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }
}

// Default rate-limit detection: works for most providers since 429 is the HTTP standard.
// Override per-provider via `rateLimitDetector` if a provider signals limits differently.
function defaultRateLimitDetector(response) {
  if (!response) return false;
  if (response.status === 429) return true;
  const retryAfter = response.headers?.get?.("retry-after");
  return Boolean(retryAfter);
}

class AIRequestManager {
  /**
   * @param {object} options
   * @param {object} [options.cache] - object with get(key)/set(key, value, ttl). Defaults to SimpleCache.
   * @param {object} [options.emitter] - object with on/emit. Defaults to SimpleEmitter.
   * @param {() => boolean} [options.isOnline] - returns current connectivity status.
   */
  constructor(options = {}) {
    this.providers = []; // sorted by priority ascending (1 = highest priority)
    this.cache = options.cache || new SimpleCache();
    this.emitter = options.emitter || new SimpleEmitter();
    this.isOnline =
      options.isOnline ||
      (() => (typeof navigator !== "undefined" ? navigator.onLine : true));
    this.queue = []; // offline-queued requests, replayed in order when back online
    this.stats = {}; // per-provider success/failure counters
  }

  on(event, fn) {
    this.emitter.on(event, fn);
    return this;
  }

  /**
   * Register an AI provider.
   * @param {object} config
   * @param {string} config.name - e.g. "groq", "gemini", "anthropic"
   * @param {number} config.priority - lower number = tried first
   * @param {(prompt: string, model: string, config: object) => Promise<Response>} config.send
   *   Function that performs the actual fetch/call and returns a standard fetch Response
   *   (or anything with .ok, .status, .headers, and an async .json()).
   * @param {(response: Response) => boolean} [config.rateLimitDetector]
   */
  registerProvider(config) {
    if (!config.name || typeof config.send !== "function") {
      throw new Error("registerProvider requires { name, send }");
    }
    this.providers.push({
      priority: config.priority ?? this.providers.length + 1,
      rateLimitDetector: defaultRateLimitDetector,
      ...config,
    });
    this.providers.sort((a, b) => a.priority - b.priority);
    this.stats[config.name] = { success: 0, failure: 0, rateLimited: 0 };
  }

  _orderedProviders(preferredName) {
    if (!preferredName) return this.providers;
    const preferred = this.providers.find((p) => p.name === preferredName);
    const rest = this.providers.filter((p) => p.name !== preferredName);
    return preferred ? [preferred, ...rest] : this.providers;
  }

  /**
   * Make an AI request with caching, offline queueing, and auto-failover.
   * @param {object} args
   * @param {string} args.prompt
   * @param {string} [args.model]
   * @param {string} [args.provider] - preferred provider name to try first
   * @param {string} [args.cacheKey] - defaults to a hash of prompt+model
   * @param {number} [args.cacheTtlMs] - how long to cache the response
   * @param {number} [args.maxRetryDelayMs] - cap for exponential backoff between provider attempts
   */
  async request({
    prompt,
    model,
    provider,
    cacheKey,
    cacheTtlMs = 5 * 60 * 1000,
    maxRetryDelayMs = 4000,
  }) {
    const key = cacheKey || `${provider || "any"}:${model || "default"}:${prompt}`;

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.emitter.emit("onCacheHit", { key });
      return cached;
    }

    if (!this.isOnline()) {
      this.queue.push({ prompt, model, provider, cacheKey: key, cacheTtlMs });
      this.emitter.emit("onQueued", { prompt, model, provider });
      return { queued: true, message: "Offline - request queued for replay." };
    }

    return this._attempt({ prompt, model, provider, cacheKey: key, cacheTtlMs, maxRetryDelayMs });
  }

  async _attempt({ prompt, model, provider, cacheKey, cacheTtlMs, maxRetryDelayMs }) {
    const ordered = this._orderedProviders(provider);
    if (ordered.length === 0) {
      throw new Error("No AI providers registered.");
    }

    let lastError = null;

    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      try {
        const response = await p.send(prompt, model, p);

        if (p.rateLimitDetector(response)) {
          this.stats[p.name].rateLimited++;
          this.emitter.emit("onRateLimit", { provider: p.name });

          if (i < ordered.length - 1) {
            const delay = Math.min(2 ** i * 250, maxRetryDelayMs);
            await new Promise((res) => setTimeout(res, delay));
            this.emitter.emit("onProviderFailover", {
              from: p.name,
              to: ordered[i + 1].name,
            });
            continue;
          } else {
            this.emitter.emit("onAllProvidersExhausted", { prompt, model });
            throw new Error("All providers rate-limited or unavailable.");
          }
        }

        if (!response.ok) {
          throw new Error(`Provider "${p.name}" returned status ${response.status}`);
        }

        const data = await response.json();
        this.stats[p.name].success++;
        this.cache.set(cacheKey, data, cacheTtlMs);
        this.emitter.emit("onSuccess", { provider: p.name });
        return data;
      } catch (err) {
        lastError = err;
        this.stats[p.name].failure++;

        if (i < ordered.length - 1) {
          this.emitter.emit("onProviderFailover", {
            from: p.name,
            to: ordered[i + 1].name,
            reason: err.message,
          });
          continue;
        }
      }
    }

    this.emitter.emit("onAllProvidersExhausted", { prompt, model, error: lastError?.message });
    throw lastError || new Error("All AI providers failed.");
  }

  /** Replay queued requests in order, e.g. call this on a "back online" event. */
  async processQueue() {
    const pending = [...this.queue];
    this.queue = [];
    const results = [];
    for (const req of pending) {
      try {
        const result = await this._attempt({
          ...req,
          cacheKey: req.cacheKey,
          maxRetryDelayMs: 4000,
        });
        results.push({ ok: true, request: req, result });
      } catch (err) {
        results.push({ ok: false, request: req, error: err.message });
      }
    }
    this.emitter.emit("onQueueProcessed", { count: pending.length });
    return results;
  }

  getStats() {
    return this.stats;
  }
}

module.exports = { AIRequestManager, SimpleCache, SimpleEmitter };
