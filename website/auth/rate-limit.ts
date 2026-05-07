// KV-backed sliding-bucket rate limiter for auth endpoints.
//
// We use a coarse per-window counter. KV has a 60s minimum TTL and 1 write/sec
// per key; this is fine for low-volume per-email/per-IP counters but is not
// suitable for high-traffic abuse protection. See project-docs/auth/design.md
// for the upgrade path (Durable Object).

import type { KVNamespace } from './types.js';

export const SEND_PER_EMAIL_LIMIT = 5;
export const SEND_PER_IP_LIMIT = 20;
export const VERIFY_PER_IP_LIMIT = 50;
export const RATE_WINDOW_SECONDS = 600; // 10 minutes

function bucketKey(prefix: string, id: string): string {
  const windowIndex = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  return `rl:${prefix}:${id}:${windowIndex}`;
}

async function increment(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key);
  const n = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
  await kv.put(key, String(n), { expirationTtl: RATE_WINDOW_SECONDS + 60 });
  return n;
}

export async function checkSendRate(
  kv: KVNamespace,
  email: string,
  ip: string,
): Promise<{ allowed: boolean; reason?: 'email' | 'ip' }> {
  const emailCount = await increment(kv, bucketKey('send-email', email.toLowerCase()));
  if (emailCount > SEND_PER_EMAIL_LIMIT) return { allowed: false, reason: 'email' };
  const ipCount = await increment(kv, bucketKey('send-ip', ip));
  if (ipCount > SEND_PER_IP_LIMIT) return { allowed: false, reason: 'ip' };
  return { allowed: true };
}

export async function checkVerifyRate(
  kv: KVNamespace,
  ip: string,
): Promise<{ allowed: boolean }> {
  const n = await increment(kv, bucketKey('verify-ip', ip));
  return { allowed: n <= VERIFY_PER_IP_LIMIT };
}
