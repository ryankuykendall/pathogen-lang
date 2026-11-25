import type {
  ClipPathOutput,
  CSSPropertyDeclaration,
  FilterOutput,
  GradientOutput,
  LayerOutput,
  CompileWarning,
  LogEntry,
  MarkerOutput,
  MaskOutput,
  PatternOutput,
} from './compiler';

export interface Preferences {
  width: number;
  height: number;
  background: string;
  gridEnabled: boolean;
  gridColor: string;
  gridSize: number;
  toFixed: number | null;
}

/**
 * Every file as the preview last drew, and the program that drew (note 58,
 * step 3): what a snapshot keeps. A copy taken with that compile, so later
 * edits never reach it.
 */
export interface RenderedFiles {
  /** Path → text. pathogen.json is never among them. */
  texts: ReadonlyMap<string, string>;
  folders: readonly string[];
  entryPoints: readonly string[];
  /** The path of the program that drew. */
  program: string;
}

export interface StoreState {
  // Routing
  currentRoute: string;
  currentView: string;
  routeParams: Record<string, string>;
  routeQuery: Record<string, string>;

  // Workspaces
  workspaces: unknown[];
  workspacesLoading: boolean;
  workspacesError: string | null;

  // Current workspace
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceDescription: string | null;
  workspaceIsPublic: boolean;
  /** The moderation state: 'unpublished' | 'pending' | 'approved' | 'rejected' | 'flagged'. */
  workspacePublicationState: string;
  /** An edit waiting for re-review: set on load and after each save (2e step 5c). */
  workspaceRereviewPending: boolean;
  workspaceOwnerId: string | null;
  workspaceUpdatedAt: string | null;
  workspaceManualThumbnailAt: string | null;

  // Snapshots — see state/store.ts for semantics.
  renderedCode: string | null;
  renderedFiles: RenderedFiles | null;
  snapshotCount: number | null;
  recentSnapshots: { id: string; n: number; cardUrl: string }[];
  snapshotsPage: { workspaceName: string; workspaceSlugId: string; currentName: string | null } | null;

  // Save status
  saveStatus: 'idle' | 'modified' | 'saving' | 'saved' | 'error' | 'not-saved';
  saveError: string | null;
  /** A save past a limit, not sent (services/save-limits.ts): the error panel's section until a save fits. */
  saveRefusal: { file: string; message: string } | null;

  // User preferences
  preferences: Preferences;

  // Editor
  code: string;
  isModified: boolean;

  // The workspace's files (phase 2; project-docs/modules/51-phase-2c-plan.md).
  // `code` is the open file's live text; `workspaceFiles` holds every
  // .pathogen file's text by workspace path (no leading slash): the open
  // file's entry can lag `code`, every other file's is its latest (a tab
  // switch writes the outgoing file's text here, services/open-files.ts).
  // Read them together through services/workspace-files.ts `workspaceNow()`.
  workspaceFiles: Record<string, string>;
  workspaceFolders: string[];
  workspaceEntryPoints: string[];
  /**
   * The file in the editor; null with every tab closed (2d, step 4d), when the
   * editor shows its zero-state and `code` is ''. Read it with
   * services/workspace-files.ts `openFileNow()`, never `as string`.
   */
  openFile: string | null;
  /** The editor's tabs, in order; `openFile` is one of them. Empty with no file open. */
  openFiles: string[];
  /** The program the preview shows; null means the main (the first entry point). */
  shownProgram: string | null;
  /**
   * Why the workspace's thumbnail can't be taken now, as Set Thumbnail says it
   * ("Show the main first"), or null when it can (2d, step 5a). It's always the
   * main's drawing, and it's taken from the preview. Set by workspace-view.
   */
  thumbnailWait: string | null;
  /**
   * A saved workspace with no program: nothing compiles, the preview is blank,
   * and Export, Snapshot, Set Thumbnail and Make public wait (2d, step 9a). A
   * main that became a module isn't this: it's still the main. Set by
   * workspace-view, from the same reading as the main.
   */
  noPrograms: boolean;
  /**
   * With more than one program, each program's name as the chip shows it
   * (`try-sizes`, or `gears · demos` when two share a name), and the shown
   * one's; null with one program or none. Export's title, Copy SVG's line in
   * the menu and the Snapshot panel name the program they take with it (2g;
   * docs/workspace-files.md "The preview and the program list"). Set by
   * workspace-view with the chip.
   */
  programNames: { shown: string; byPath: Record<string, string> } | null;

  // Compilation results
  pathData: string;
  logs: LogEntry[];
  warnings: CompileWarning[];
  error: string | null;
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  filters: FilterOutput[];
  cssProperties: CSSPropertyDeclaration[];
  layerVisibility: Record<string, boolean>;
  defsVisibility: Record<string, boolean>;

  // Compilation status
  compilationStatus: 'idle' | 'compiling' | 'rendering' | 'completed' | 'error' | 'cancelled';
  compilationError: string | null;
  compilationId: number;
  // Elapsed time of the in-flight compile, quantized to whole seconds. Ticked
  // by workspace-view's compile ticker during real compiles and reset to 0 at
  // every compile start; storybook stories may seed a static value for a
  // frozen demo chip. Drives the "Compiling... MM:SS" chip.
  compilationElapsedMs: number;
  calledStdlibFunctions: string[];
  // Formatted font-weight substitution messages for the warning banner;
  // empty when the last compile had none (or failed).
  fontWarnings: string[];
  multiTabWarning: boolean;

  // SVG styles
  width: number;
  height: number;
  background: string;
  gridEnabled: boolean;
  gridColor: string;
  gridSize: number;
  toFixed: number | null;

  // Zoom/pan
  zoomLevel: number;
  panX: number;
  panY: number;

  // Pane visibility
  consoleOpen: boolean;
  docsOpen: boolean;
  inspectorOpen: boolean;
  /** The file tree, beside the editor; Files in the breadcrumb toggles it. */
  filesOpen: boolean;

  // File state
  currentFileName: string | null;
  currentFileHandle: FileSystemFileHandle | null;
}

export type StoreKey = keyof StoreState;

export type StoreCallback<K extends StoreKey = StoreKey> = (
  value: StoreState[K],
  key: K,
) => void;

export interface Store {
  get<K extends StoreKey>(key: K): StoreState[K];
  getAll(): StoreState;
  set<K extends StoreKey>(key: K, value: StoreState[K]): void;
  update(updates: Partial<StoreState>): void;
  subscribe(keys: StoreKey | StoreKey[], callback: StoreCallback): () => void;
  notify(key: StoreKey): void;
  batch(fn: (state: StoreState) => void): void;
}
