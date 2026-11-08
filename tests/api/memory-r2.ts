// An in-memory R2 bucket for API tests, shaped like the real binding: get,
// put, head, list by prefix in pages, and delete of up to 1,000 keys per call.
// Every call is counted, so a test can check a request stays inside the
// Worker's budget of 1,000 KV and R2 calls.

import type { R2Bucket, R2Object } from '../../website/api/types';

export class MemoryR2 implements R2Bucket {
  private readonly store = new Map<string, Uint8Array>();

  /** Every call, by method. */
  readonly calls = { get: 0, put: 0, head: 0, list: 0, delete: 0 };

  async get(key: string): Promise<R2Object | null> {
    this.calls.get++;
    const value = this.store.get(key);
    return value === undefined ? null : { body: new Response(value).body! };
  }

  async put(key: string, value: Parameters<R2Bucket['put']>[1]): Promise<void> {
    this.calls.put++;
    if (typeof value === 'string') this.store.set(key, new TextEncoder().encode(value));
    else if (value instanceof ArrayBuffer) this.store.set(key, new Uint8Array(value.slice(0)));
    else this.store.set(key, new Uint8Array(await new Response(value).arrayBuffer()));
  }

  async head(key: string): Promise<{ size: number } | null> {
    this.calls.head++;
    const value = this.store.get(key);
    return value === undefined ? null : { size: value.length };
  }

  async delete(keys: string | string[]): Promise<void> {
    this.calls.delete++;
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length > 1000) throw new Error('R2: at most 1000 keys per delete');
    for (const key of list) this.store.delete(key);
  }

  async list(
    options: { prefix?: string; cursor?: string; limit?: number } = {},
  ): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }> {
    this.calls.list++;
    const all = this.keys(options.prefix ?? '');
    const start = Number(options.cursor ?? 0);
    const page = all.slice(start, start + Math.min(options.limit ?? 1000, 1000));
    const next = start + page.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated: next < all.length,
      cursor: next < all.length ? String(next) : undefined,
    };
  }

  /** Test helpers, not counted. */
  keys(prefix = ''): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  text(key: string): string | undefined {
    const value = this.store.get(key);
    return value === undefined ? undefined : new TextDecoder().decode(value);
  }

  totalCalls(): number {
    return Object.values(this.calls).reduce((a, b) => a + b, 0);
  }

  resetCalls(): void {
    for (const k of Object.keys(this.calls) as (keyof MemoryR2['calls'])[]) this.calls[k] = 0;
  }
}
