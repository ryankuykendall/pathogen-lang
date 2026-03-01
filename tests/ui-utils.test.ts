import { describe, it, expect } from 'vitest';
import { ALPHABET, generateNanoId } from '../playground/utils/nano-id.js';
import { buildWorkspaceSlugId, parseWorkspaceSlugId } from '../playground/utils/router.js';

describe('nano-id', () => {
  it('ALPHABET has exactly 64 characters (bitmask contract)', () => {
    expect(ALPHABET.length).toBe(64);
  });

  it('ALPHABET[63] is not undefined', () => {
    expect(ALPHABET[63]).toBeDefined();
    expect(typeof ALPHABET[63]).toBe('string');
  });

  it('every index from byte & 63 maps to a string character', () => {
    for (let i = 0; i < 256; i++) {
      const char = ALPHABET[i & 63];
      expect(typeof char).toBe('string');
      expect(char).not.toBe('undefined');
    }
  });

  it('generates IDs of correct length (default 21)', () => {
    const id = generateNanoId();
    expect(id.length).toBe(21);
  });

  it('generates IDs of custom length', () => {
    const id = generateNanoId(10);
    expect(id.length).toBe(10);
  });

  it('generated IDs contain only ALPHABET characters', () => {
    const allowedSet = new Set(ALPHABET);
    for (let i = 0; i < 100; i++) {
      const id = generateNanoId();
      for (const ch of id) {
        expect(allowedSet.has(ch)).toBe(true);
      }
    }
  });

  it('no generated ID contains the substring "undefined"', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateNanoId();
      expect(id).not.toContain('undefined');
    }
  });
});

describe('workspace slug', () => {
  describe('buildWorkspaceSlugId', () => {
    it('combines slug and id with -- separator', () => {
      expect(buildWorkspaceSlugId('my-project', 'abc123')).toBe('my-project--abc123');
    });

    it('returns just the id when slug is null', () => {
      expect(buildWorkspaceSlugId(null, 'abc123')).toBe('abc123');
    });

    it('returns just the id when slug is empty string', () => {
      expect(buildWorkspaceSlugId('', 'abc123')).toBe('abc123');
    });
  });

  describe('parseWorkspaceSlugId', () => {
    it('parses slug--id format', () => {
      expect(parseWorkspaceSlugId('my-project--abc123')).toEqual({
        slug: 'my-project',
        id: 'abc123',
      });
    });

    it('parses id-only format', () => {
      expect(parseWorkspaceSlugId('abc123')).toEqual({
        slug: null,
        id: 'abc123',
      });
    });

    it('returns nulls for null input', () => {
      expect(parseWorkspaceSlugId(null)).toEqual({
        slug: null,
        id: null,
      });
    });

    it('returns nulls for undefined input', () => {
      expect(parseWorkspaceSlugId(undefined)).toEqual({
        slug: null,
        id: null,
      });
    });

    it('handles slugs containing hyphens', () => {
      expect(parseWorkspaceSlugId('my-cool-project--abc123')).toEqual({
        slug: 'my-cool-project',
        id: 'abc123',
      });
    });

    it('splits on first -- when multiple delimiters exist', () => {
      expect(parseWorkspaceSlugId('a--b--c')).toEqual({
        slug: 'a',
        id: 'b--c',
      });
    });

    it('roundtrips slug and id correctly', () => {
      const slug = 'my-project';
      const id = 'abc123XYZ';
      const combined = buildWorkspaceSlugId(slug, id);
      const parsed = parseWorkspaceSlugId(combined);
      expect(parsed).toEqual({ slug, id });
    });

    it('roundtrips id-only correctly', () => {
      const id = 'abc123XYZ';
      const combined = buildWorkspaceSlugId(null, id);
      const parsed = parseWorkspaceSlugId(combined);
      expect(parsed).toEqual({ slug: null, id });
    });
  });
});
