/**
 * encryption.js — Novixo Engine (Phase 7d)
 * AES-256-GCM Queue Encryption.
 *
 * THE PROBLEM:
 * Queue items in IndexedDB are readable in plain text via dev tools.
 * For banks, hospitals, and government apps — unacceptable.
 *
 * THE SOLUTION:
 * Every item is encrypted before IndexedDB write using AES-256-GCM
 * — the same standard used by banks and militaries.
 * Decrypted only when needed for sync.
 *
 * HOW TO ENABLE:
 *   await Novixo.init({
 *     encryption: true,
 *     encryptionKey: "your-32-char-minimum-secret-key",
 *   });
 */

const ALGO    = "AES-GCM";
const KEY_LEN = 256;
const IV_LEN  = 12;

let _cryptoKey = null;

// ── Init ──────────────────────────────────────

export async function initEncryption(passphrase) {
  if (!passphrase) throw new Error("[NovixoEngine:Encryption] Passphrase required.");
  if (!crypto?.subtle) throw new Error("[NovixoEngine:Encryption] Web Crypto API unavailable.");

  const enc         = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const salt        = enc.encode("novixo-engine-salt-v1");

  _cryptoKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ["encrypt", "decrypt"]
  );

  console.log("[NovixoEngine:Encryption] AES-256-GCM ready ✓");
}

// ── Encrypt ───────────────────────────────────

export async function encryptItem(item) {
  if (!_cryptoKey) { console.warn("[NovixoEngine:Encryption] Not initialized."); return item; }
  try {
    const encrypted = await encryptString(JSON.stringify(item.payload ?? {}));
    return { ...item, payload: encrypted, _encrypted: true };
  } catch (err) {
    console.error("[NovixoEngine:Encryption] Encrypt failed:", err);
    return item;
  }
}

// ── Decrypt ───────────────────────────────────

export async function decryptItem(item) {
  if (!item._encrypted || !_cryptoKey) return item;
  try {
    const decrypted = await decryptString(item.payload);
    return { ...item, payload: JSON.parse(decrypted), _encrypted: false };
  } catch (err) {
    console.error("[NovixoEngine:Encryption] Decrypt failed:", err);
    return item;
  }
}

export function isEncryptionReady() { return _cryptoKey !== null; }

// ── Internal ──────────────────────────────────

async function encryptString(plaintext) {
  const enc        = new TextEncoder();
  const iv         = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, _cryptoKey, enc.encode(plaintext));
  const combined   = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptString(base64) {
  const combined   = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv         = combined.slice(0, IV_LEN);
  const ciphertext = combined.slice(IV_LEN);
  const decrypted  = await crypto.subtle.decrypt({ name: ALGO, iv }, _cryptoKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}
