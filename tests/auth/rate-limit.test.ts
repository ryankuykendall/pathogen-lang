import { describe, expect, it } from 'vitest';

import {
  checkSendRate,
  SEND_PER_EMAIL_LIMIT,
  SEND_PER_IP_LIMIT,
} from '../../website/auth/rate-limit';
import { MemoryKV } from './helpers';

describe('checkSendRate', () => {
  it('allows up to the per-email limit, then rejects', async () => {
    const kv = new MemoryKV();
    for (let i = 1; i <= SEND_PER_EMAIL_LIMIT; i++) {
      const r = await checkSendRate(kv, 'a@x.test', '1.1.1.1');
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSendRate(kv, 'a@x.test', '1.1.1.1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('email');
  });

  it('separately tracks per-IP across distinct emails', async () => {
    const kv = new MemoryKV();
    // Drain the per-IP bucket using fresh emails so we don't trip per-email first.
    for (let i = 1; i <= SEND_PER_IP_LIMIT; i++) {
      const r = await checkSendRate(kv, `u${i}@x.test`, '2.2.2.2');
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSendRate(kv, 'fresh@x.test', '2.2.2.2');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('ip');
  });

  it('treats emails case-insensitively for limiting', async () => {
    const kv = new MemoryKV();
    for (let i = 1; i <= SEND_PER_EMAIL_LIMIT; i++) {
      await checkSendRate(kv, 'X@y.test', '3.3.3.3');
    }
    const blocked = await checkSendRate(kv, 'x@Y.test', '3.3.3.3');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('email');
  });
});
