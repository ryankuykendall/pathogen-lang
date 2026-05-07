// Minimal in-memory KV and D1 stand-ins for unit tests.
//
// These are intentionally simple and only support the operations the auth
// modules call. A miniflare-backed integration test (real KV + real D1) is
// tracked as a follow-up; see project-docs/auth/design.md.

import type {
  D1Database,
  D1PreparedStatement,
  KVNamespace,
} from '../../website/auth/types';

interface KVEntry {
  value: string;
  expiresAt?: number;
}

export class MemoryKV implements KVNamespace {
  private store = new Map<string, KVEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Test-only helpers
  rawGet(key: string): string | undefined {
    return this.store.get(key)?.value;
  }

  size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

// Minimal D1 mock — supports the exact queries used by the auth modules.
// It's pattern-based, not a real SQL engine. Each test sets up the rows
// it needs via direct mutation of the underlying tables.

interface UserRow {
  id: string;
  email: string;
  email_lower: string;
  handle: string;
  display_name: string;
  created_at: number;
  verified_at: number | null;
}

interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export class MemoryD1 implements D1Database {
  users: UserRow[] = [];
  sessions: SessionRow[] = [];

  prepare(query: string): D1PreparedStatement {
    return new MemoryD1Statement(this, query, []);
  }

  async exec(_query: string): Promise<unknown> {
    return null;
  }
}

class MemoryD1Statement implements D1PreparedStatement {
  constructor(
    private db: MemoryD1,
    private query: string,
    private args: unknown[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new MemoryD1Statement(this.db, this.query, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const q = this.normalize();
    if (q === 'select 1 as one from users where handle = ?') {
      const handle = this.args[0] as string;
      const row = this.db.users.find((u) => u.handle === handle);
      return (row ? ({ one: 1 } as unknown as T) : null);
    }
    if (q === 'select * from users where id = ?') {
      const id = this.args[0] as string;
      const row = this.db.users.find((u) => u.id === id);
      return (row ? (row as unknown as T) : null);
    }
    if (q === 'select * from users where email_lower = ?') {
      const lower = this.args[0] as string;
      const row = this.db.users.find((u) => u.email_lower === lower);
      return (row ? (row as unknown as T) : null);
    }
    if (q === 'select * from users where handle = ?') {
      const handle = this.args[0] as string;
      const row = this.db.users.find((u) => u.handle === handle);
      return (row ? (row as unknown as T) : null);
    }
    if (q === 'select user_id, expires_at from sessions where token = ?') {
      const token = this.args[0] as string;
      const row = this.db.sessions.find((s) => s.token === token);
      return (row ? ({ user_id: row.user_id, expires_at: row.expires_at } as unknown as T) : null);
    }
    throw new Error(`MemoryD1: unsupported query: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    throw new Error(`MemoryD1: unsupported all() query: ${this.query}`);
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const q = this.normalize();
    if (q.startsWith('insert into users')) {
      const [id, email, email_lower, handle, display_name, created_at, verified_at] = this.args as [
        string, string, string, string, string, number, number | null,
      ];
      this.db.users.push({ id, email, email_lower, handle, display_name, created_at, verified_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q === 'update users set verified_at = ? where id = ?') {
      const ts = this.args[0] as number;
      const id = this.args[1] as string;
      const row = this.db.users.find((u) => u.id === id);
      if (row) row.verified_at = ts;
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith('insert into sessions')) {
      const [token, user_id, created_at, expires_at] = this.args as [string, string, number, number];
      this.db.sessions.push({ token, user_id, created_at, expires_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q === 'delete from sessions where token = ?') {
      const token = this.args[0] as string;
      const before = this.db.sessions.length;
      this.db.sessions = this.db.sessions.filter((s) => s.token !== token);
      return { success: true, meta: { changes: before - this.db.sessions.length } };
    }
    if (q === 'delete from sessions where user_id = ?') {
      const userId = this.args[0] as string;
      const before = this.db.sessions.length;
      this.db.sessions = this.db.sessions.filter((s) => s.user_id !== userId);
      return { success: true, meta: { changes: before - this.db.sessions.length } };
    }
    throw new Error(`MemoryD1: unsupported run() query: ${this.query}`);
  }

  private normalize(): string {
    return this.query.replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
