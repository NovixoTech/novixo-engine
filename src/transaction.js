/**
 * transaction.js — Novixo Engine (Phase 7c)
 * Transaction Integrity — Exactly-Once Delivery.
 *
 * THE PROBLEM FOR BANKS AND FINTECH:
 * Network drops at the exact moment a payment processes.
 * App retries. Payment happens TWICE. Customer charged twice.
 *
 * THE SOLUTION — IDEMPOTENCY:
 * Every transaction gets a stable unique key derived from its content.
 * Server uses this key to return the original result instead of
 * processing the same transaction twice.
 *
 * HOW TO USE:
 *   await Novixo.sendTransaction({
 *     type: "payment",
 *     payload: { amount: 5000, to: "user_123" },
 *   });
 *   // Sends header: "Idempotency-Key: txn_payment_a3f9x"
 *   // If retried → server returns original result, never charges twice
 */

import { saveLocal, loadLocal } from "./storage.js";

const TXN_STORE_KEY = "novixo_transactions";

export const TxnState = {
  PENDING:   "PENDING",
  SENT:      "SENT",
  CONFIRMED: "CONFIRMED",
  FAILED:    "FAILED",
};

let transactions = new Map();

// ── Init ──────────────────────────────────────

export async function initTransactions() {
  try {
    const saved = await loadLocal(TXN_STORE_KEY, {});
    transactions = new Map(Object.entries(saved));
    console.log(`[NovixoEngine:Txn] Loaded ${transactions.size} transaction(s).`);
  } catch {
    transactions = new Map();
  }
}

// ── Create ────────────────────────────────────

export function createTransaction(data) {
  const key = generateKey(data);

  if (transactions.has(key)) {
    const existing = transactions.get(key);
    if (existing.state === TxnState.CONFIRMED) {
      console.log(`[NovixoEngine:Txn] [${key}] already confirmed. Skipping.`);
      return null;
    }
    console.log(`[NovixoEngine:Txn] Resuming [${key}].`);
    return existing.item;
  }

  const item = { ...data, _transaction: true, _idempotencyKey: key, _txnCreatedAt: Date.now() };
  transactions.set(key, { idempotencyKey: key, state: TxnState.PENDING, createdAt: Date.now(), item });
  return item;
}

export function getIdempotencyHeader(item) {
  return item?._idempotencyKey ?? null;
}

// ── State updates ─────────────────────────────

export async function markTxnSent(key) {
  update(key, { state: TxnState.SENT, sentAt: Date.now() });
  await persist();
}

export async function markTxnConfirmed(key) {
  update(key, { state: TxnState.CONFIRMED, confirmedAt: Date.now() });
  await persist();
  console.log(`[NovixoEngine:Txn] ✓ Confirmed [${key}]`);
}

export async function markTxnFailed(key, reason) {
  update(key, { state: TxnState.FAILED, failedAt: Date.now(), reason });
  await persist();
}

// ── Query ─────────────────────────────────────

export function getTransaction(key)    { return transactions.get(key) ?? null; }
export function getAllTransactions()    { return Array.from(transactions.values()); }
export function getPendingTransactions() {
  return getAllTransactions().filter((t) => t.state === TxnState.PENDING || t.state === TxnState.SENT);
}
export function isConfirmed(key) { return transactions.get(key)?.state === TxnState.CONFIRMED; }

export async function clearConfirmedTransactions() {
  for (const [key, t] of transactions.entries()) {
    if (t.state === TxnState.CONFIRMED) transactions.delete(key);
  }
  await persist();
}

// ── Internal ──────────────────────────────────

function generateKey(data) {
  const type    = data.type ?? "unknown";
  const payload = data.payload ?? {};
  const hash    = simpleHash(stableStringify(payload));
  return `txn_${type}_${hash}`;
}

function update(key, changes) {
  const existing = transactions.get(key);
  if (existing) transactions.set(key, { ...existing, ...changes });
}

async function persist() {
  const obj = Object.fromEntries(transactions.entries());
  await saveLocal(TXN_STORE_KEY, obj);
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => `"${k}":${stableStringify(obj[k])}`).join(",") + "}";
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
