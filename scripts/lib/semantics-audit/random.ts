/**
 * Seeded `Math.random` for the semantics audit. Each program gets the same
 * sequence in the old and the new evaluator (keyed by its id), so a random
 * program differs only when the two evaluators consume the sequence
 * differently — which the call count shows.
 */

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with Math.random replaced by a generator seeded from `key`; report how many numbers it drew. */
export function withSeededRandom<T>(key: string, fn: () => T): { value: T; randomCalls: number } {
  const original = Math.random;
  const next = mulberry32(fnv1a(key));
  let calls = 0;
  Math.random = () => {
    calls++;
    return next();
  };
  try {
    return { value: fn(), randomCalls: calls };
  } finally {
    Math.random = original;
  }
}
