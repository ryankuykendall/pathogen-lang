// Reading what a workspace stored, for API tests: its record in KV and, since
// phase 2, its files in R2 at files/{id}/{sha256}.

import type { MemoryR2 } from './memory-r2';
import type { KVNamespace, Workspace } from '../../website/api/types';

export async function storedRecord(kv: KVNamespace, id: string): Promise<Workspace> {
  const raw = await kv.get(`workspace:${id}`);
  if (!raw) throw new Error(`no workspace:${id}`);
  return JSON.parse(raw) as Workspace;
}

/** The text of a stored file: from R2, or a record from before phase 2's `code`. */
export async function storedText(kv: KVNamespace, r2: MemoryR2, id: string, path = 'main.pathogen'): Promise<string> {
  const record = await storedRecord(kv, id);
  if (record.files === undefined) {
    if (path !== 'main.pathogen') throw new Error('a record from before phase 2 holds only main.pathogen');
    return record.code ?? '';
  }
  const entry = record.files[path];
  if (!entry) throw new Error(`workspace ${id} has no ${path}`);
  const text = r2.text(`files/${id}/${entry.sha256}`);
  if (text === undefined) throw new Error(`files/${id}/${entry.sha256} is missing from R2`);
  return text;
}
