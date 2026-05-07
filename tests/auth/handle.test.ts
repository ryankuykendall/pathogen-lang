import { describe, expect, it } from 'vitest';

import { findAvailableHandle, slugifyHandle } from '../../website/auth/handle';
import { MemoryD1 } from './helpers';

describe('slugifyHandle', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyHandle('Ryan K')).toBe('ryan-k');
  });

  it('strips diacritics and unsupported characters', () => {
    expect(slugifyHandle('Renée!')).toBe('rene');
    expect(slugifyHandle('email@host.tld')).toBe('emailhost-tld');
  });

  it('collapses runs of separators and trims trailing dashes', () => {
    expect(slugifyHandle('   a__b   c   ')).toBe('a-b-c');
    expect(slugifyHandle('---a---')).toBe('a');
  });

  it('caps length at 30 chars', () => {
    const long = 'a'.repeat(80);
    expect(slugifyHandle(long).length).toBeLessThanOrEqual(30);
  });

  it('falls back to "user" when input has no slug-eligible characters', () => {
    expect(slugifyHandle('!!!')).toBe('user');
    expect(slugifyHandle('')).toBe('user');
  });
});

describe('findAvailableHandle', () => {
  it('returns the base slug when free', async () => {
    const db = new MemoryD1();
    const handle = await findAvailableHandle(db, 'Ryan K');
    expect(handle).toBe('ryan-k');
  });

  it('appends -2 on first collision and -3 on next', async () => {
    const db = new MemoryD1();
    db.users.push({
      id: 'u1', email: 'a@x', email_lower: 'a@x', handle: 'ryan-k',
      display_name: 'Ryan K', created_at: 0, verified_at: 0,
    });
    expect(await findAvailableHandle(db, 'Ryan K')).toBe('ryan-k-2');
    db.users.push({
      id: 'u2', email: 'b@x', email_lower: 'b@x', handle: 'ryan-k-2',
      display_name: 'Ryan K', created_at: 0, verified_at: 0,
    });
    expect(await findAvailableHandle(db, 'Ryan K')).toBe('ryan-k-3');
  });

  it('keeps total length under the cap when adding suffix', async () => {
    const db = new MemoryD1();
    const long = 'a'.repeat(30); // already at cap
    db.users.push({
      id: 'u1', email: 'a@x', email_lower: 'a@x', handle: long,
      display_name: long, created_at: 0, verified_at: 0,
    });
    const next = await findAvailableHandle(db, long);
    expect(next.length).toBeLessThanOrEqual(30);
    expect(next.endsWith('-2')).toBe(true);
  });
});
