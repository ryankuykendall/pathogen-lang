import { describe, it, expect } from 'vitest';

/**
 * Mirror of the slugify function from website/_worker.js.
 * Keep in sync with the worker implementation.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

describe('slugify (workspace URL slug)', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('My New Workspace')).toBe('my-new-workspace');
  });

  it('strips special characters', () => {
    expect(slugify('hello & world!')).toBe('hello-world');
  });

  it('collapses multiple separators into one', () => {
    expect(slugify('foo   bar--baz__qux')).toBe('foo-bar-baz-qux');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it('does not produce trailing hyphens after truncation', () => {
    // "testing-gradients-phase-2-reactive-gradients-plus" is 50 chars
    // but with longer input the slice can land on a hyphen
    const name = 'Testing gradients phase 2 reactive gradients plus extra words';
    const slug = slugify(name);
    expect(slug).not.toMatch(/-$/);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('no triple-hyphen when slug is joined with separator', () => {
    const name = 'Testing gradients phase 2 reactive gradients plus extra';
    const slug = slugify(name);
    const workspaceId = `${slug}--abc123`;
    expect(workspaceId).not.toContain('---');
  });

  it('handles truncation at exact word boundary', () => {
    // 50 chars: "testing-gradients-phase-2-reactive-gradients-plus"
    const name = 'Testing gradients phase 2 reactive gradients plus';
    const slug = slugify(name);
    expect(slug).toBe('testing-gradients-phase-2-reactive-gradients-plus');
    expect(slug.length).toBe(49);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles all-special-character input', () => {
    expect(slugify('!@#$%')).toBe('');
  });
});
