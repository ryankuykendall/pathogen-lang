/**
 * What a surface (CLI, VS Code extension, language server) provides so the
 * shared loader can find fonts — and, from phase 1 on, imported files. The
 * loader never touches a file system or the network itself.
 */
import type { HostFetch } from './google-fonts';

export type HostReadResult =
  | { ok: true; bytes: Uint8Array }
  /** `osPath` is where the host looked, for the message. */
  | { ok: false; code: 'not-found'; osPath: string }
  /** The file exists with different letter case; `actual` is the project path as it is on disk. */
  | { ok: false; code: 'case-mismatch'; actual: string }
  /** The path is a symbolic link (or passes through one) that leads outside the project folder. */
  | { ok: false; code: 'escapes-root' }
  /** The path names a folder (the project folder itself included), not a file. */
  | { ok: false; code: 'folder' }
  | { ok: false; code: 'unreadable'; detail: string };

export interface LocalFontMatch {
  bytes: Uint8Array;
  /** The weight of the file that was found (differs from the request only for a nearest match). */
  weight: number;
  /** Where it came from, for messages (an OS path). */
  label: string;
}

/** Bytes kept between runs, keyed by short strings the loader chooses. */
export interface FontCache {
  get: (key: string) => Promise<Uint8Array | null>;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
}

export interface FontHost {
  /** The project folder as the user knows it (an OS path), for messages. */
  readonly projectLabel: string;
  /** Read a project file. `path` is a project path from resolveProjectPath (`/fonts/a.ttf`). */
  readFile: (path: string) => Promise<HostReadResult>;
  /**
   * Find an installed font file for a family. `nearest: false` matches the
   * requested weight only; `nearest: true` may return another weight.
   */
  findLocalFont?: (family: string, weight: number, options: { nearest: boolean }) => Promise<LocalFontMatch | null>;
  /** Network access; absent when downloads are off. */
  fetch?: HostFetch;
  /** Why downloads are off, for messages: `--offline`, `PATHOGEN_OFFLINE=1`. */
  offlineReason?: string;
  cache?: FontCache;
  /** WOFF2 → TrueType. Hosts without a decoder report .woff2 files as unsupported. */
  decodeWoff2?: (bytes: Uint8Array) => Promise<Uint8Array>;
}
