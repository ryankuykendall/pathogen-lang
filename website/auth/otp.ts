// Email OTP code generation, storage, and verification.
//
// Storage shape (KV key `otp:<email_lower>`, TTL 600s):
//   { hash: string, expiresAt: number, attempts: number }
//
// On verify success or 3 failed attempts the entry is deleted, so a code is
// strictly single-use and brute-force is bounded.

import type { KVNamespace } from './types.js';

export const OTP_TTL_SECONDS = 600;       // 10 minutes
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_LENGTH = 6;

interface OtpRecord {
  hash: string;
  expiresAt: number;
  attempts: number;
}

function kvKey(email: string): string {
  return `otp:${email.toLowerCase()}`;
}

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(OTP_LENGTH));
  let out = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    out += String(bytes[i] % 10);
  }
  return out;
}

export async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time comparison of two equal-length hex strings.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function storeCode(kv: KVNamespace, email: string, code: string): Promise<void> {
  const record: OtpRecord = {
    hash: await hashCode(code),
    expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
    attempts: 0,
  };
  await kv.put(kvKey(email), JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS });
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'invalid' };

export async function verifyCode(
  kv: KVNamespace,
  email: string,
  candidate: string,
): Promise<VerifyOutcome> {
  const key = kvKey(email);
  const raw = await kv.get(key);
  if (!raw) return { ok: false, reason: 'no_code' };

  let record: OtpRecord;
  try {
    record = JSON.parse(raw);
  } catch {
    await kv.delete(key);
    return { ok: false, reason: 'no_code' };
  }

  if (Date.now() > record.expiresAt) {
    await kv.delete(key);
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await kv.delete(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const candidateHash = await hashCode(candidate);
  if (constantTimeEqual(record.hash, candidateHash)) {
    await kv.delete(key);
    return { ok: true };
  }

  const next: OtpRecord = { ...record, attempts: record.attempts + 1 };
  if (next.attempts >= OTP_MAX_ATTEMPTS) {
    await kv.delete(key);
    return { ok: false, reason: 'too_many_attempts' };
  }
  const remainingTtl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  await kv.put(key, JSON.stringify(next), { expirationTtl: remainingTtl });
  return { ok: false, reason: 'invalid' };
}
