/**
 * A project held in memory: the playground's workspace (project-docs/modules/
 * 51-phase-2c-plan.md, piece 2), whose files arrive from the API as text.
 * Answers like the Node host does on disk (src/node/index.ts), so the loader's
 * messages are the same in every tool: a file, a folder, a name that differs
 * only in letter case, or nothing.
 *
 * Paths: the loader asks for project paths with a leading slash
 * (`/parts/gears.pathogen`); a workspace keys its files without one
 * (`parts/gears.pathogen`).
 */
import { foldersOf } from '../workspace/files';

import type { HostReadResult, ProjectFileHost } from './types';

export interface MemoryProjectOptions {
  /** How messages name the project: the workspace's name. */
  label: string;
  /** Folders with nothing in them yet (workspace paths, no leading slash). */
  folders?: readonly string[];
}

/**
 * A ProjectFileHost over in-memory files: workspace path (no leading slash) →
 * text. A `Map` passed in is read live, so a host made once sees later edits.
 */
export function createMemoryProjectHost(
  files: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  options: MemoryProjectOptions,
): ProjectFileHost {
  const texts: ReadonlyMap<string, string> = files instanceof Map ? files : new Map(Object.entries(files));
  const encoder = new TextEncoder();

  const foldersNow = (): Set<string> => {
    const folders = new Set<string>();
    for (const path of texts.keys()) for (const folder of foldersOf(path)) folders.add(folder);
    for (const folder of options.folders ?? []) {
      folders.add(folder);
      for (const parent of foldersOf(`${folder}/x`)) folders.add(parent);
    }
    return folders;
  };

  return {
    projectLabel: options.label,
    readFile: async (projectPath: string): Promise<HostReadResult> => {
      const path = projectPath.replace(/^\/+/, '');
      if (path === '') return { ok: false, code: 'folder' };
      const text = texts.get(path);
      if (text !== undefined) {
        // The text itself, so the loader needn't encode and decode it again;
        // the bytes only if something asks for them.
        return {
          ok: true,
          text,
          get bytes(): Uint8Array {
            return encoder.encode(text);
          },
        };
      }
      if (foldersNow().has(path)) return { ok: false, code: 'folder' };
      const lower = path.toLowerCase();
      for (const existing of texts.keys()) {
        if (existing.toLowerCase() === lower) return { ok: false, code: 'case-mismatch', actual: `/${existing}` };
      }
      return { ok: false, code: 'not-found', osPath: path };
    },
  };
}
