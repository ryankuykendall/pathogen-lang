import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  generateCode,
  hashCode,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  storeCode,
  verifyCode,
} from '../../website/auth/otp';
import { MemoryKV } from './helpers';

describe('generateCode', () => {
  it('produces a 6-digit numeric string', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toHaveLength(OTP_LENGTH);
  });

  it('does not produce the same code twice in a row (statistical sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateCode());
    // 200 draws from 10^6 — collisions vanishingly unlikely.
    expect(seen.size).toBe(200);
  });

  it('covers all ten digits across many draws (entropy sanity)', () => {
    const digitsSeen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const ch of generateCode()) digitsSeen.add(ch);
    }
    expect(digitsSeen.size).toBe(10);
  });
});

describe('constantTimeEqual', () => {
  it('matches identical strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
  });
  it('rejects different strings of equal length', () => {
    expect(constantTimeEqual('aaa', 'bbb')).toBe(false);
  });
  it('rejects different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('storeCode + verifyCode', () => {
  const email = 'Test@Example.Com';

  it('stores hashed (not plaintext) and verifies once', async () => {
    const kv = new MemoryKV();
    const code = '123456';
    await storeCode(kv, email, code);

    const raw = kv.rawGet(`otp:${email.toLowerCase()}`)!;
    expect(raw).toBeDefined();
    expect(raw).not.toContain(code); // plaintext is NOT stored

    const ok = await verifyCode(kv, email, code);
    expect(ok.ok).toBe(true);

    // Single-use: second verify with the same code must fail
    const second = await verifyCode(kv, email, code);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('no_code');
  });

  it('case-insensitive on email', async () => {
    const kv = new MemoryKV();
    await storeCode(kv, 'Foo@Bar.com', '999000');
    const ok = await verifyCode(kv, 'FOO@bar.COM', '999000');
    expect(ok.ok).toBe(true);
  });

  it('rejects wrong codes and increments attempts up to the cap', async () => {
    const kv = new MemoryKV();
    await storeCode(kv, email, '111111');

    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      const r = await verifyCode(kv, email, '000000');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid');
    }
    // Final wrong attempt invalidates the code.
    const last = await verifyCode(kv, email, '000000');
    expect(last.ok).toBe(false);
    if (!last.ok) expect(['invalid', 'too_many_attempts']).toContain(last.reason);

    // Now the real code is also rejected.
    const real = await verifyCode(kv, email, '111111');
    expect(real.ok).toBe(false);
    if (!real.ok) expect(real.reason).toBe('no_code');
  });

  it('returns no_code when nothing was stored', async () => {
    const kv = new MemoryKV();
    const r = await verifyCode(kv, email, '123456');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_code');
  });

  it('hashCode is stable for the same input', async () => {
    const a = await hashCode('123456');
    const b = await hashCode('123456');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
