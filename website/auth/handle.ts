// Auto-derive a URL-safe handle from a display name.
// Collisions resolved by appending -2, -3, ... up to a hard cap.

import type { D1Database } from './types.js';

const HANDLE_MAX_LENGTH = 30;
const HANDLE_FALLBACK = 'user';
const COLLISION_SUFFIX_CAP = 9999;

export function slugifyHandle(input: string): string {
  const lowered = (input || '').toLowerCase();
  // Strip everything that isn't a-z, 0-9 or hyphen-eligible separator.
  let slug = '';
  let lastWasDash = false;
  for (const ch of lowered) {
    if (ch >= 'a' && ch <= 'z') {
      slug += ch;
      lastWasDash = false;
    } else if (ch >= '0' && ch <= '9') {
      slug += ch;
      lastWasDash = false;
    } else if (ch === '-' || ch === '_' || ch === ' ' || ch === '.') {
      if (!lastWasDash && slug.length > 0) {
        slug += '-';
        lastWasDash = true;
      }
    }
    // else drop
  }
  // Trim trailing dash and cap length
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  if (slug.length === 0) return HANDLE_FALLBACK;
  if (slug.length > HANDLE_MAX_LENGTH) {
    slug = slug.slice(0, HANDLE_MAX_LENGTH);
    while (slug.endsWith('-')) slug = slug.slice(0, -1);
  }
  return slug || HANDLE_FALLBACK;
}

export async function findAvailableHandle(db: D1Database, base: string): Promise<string> {
  const slug = slugifyHandle(base);
  if (!(await handleExists(db, slug))) return slug;
  for (let i = 2; i <= COLLISION_SUFFIX_CAP; i++) {
    const suffix = `-${i}`;
    const trimmed = slug.length + suffix.length > HANDLE_MAX_LENGTH
      ? slug.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(/-+$/, '')
      : slug;
    const candidate = `${trimmed || HANDLE_FALLBACK}${suffix}`;
    if (!(await handleExists(db, candidate))) return candidate;
  }
  // Astronomically unlikely. Fall back to a random suffix.
  const r = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${slug.slice(0, HANDLE_MAX_LENGTH - r.length - 1)}-${r}`;
}

async function handleExists(db: D1Database, handle: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS one FROM users WHERE handle = ?')
    .bind(handle)
    .first<{ one: number }>();
  return row !== null;
}
