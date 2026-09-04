import type {
  ClipPathOutput,
  CSSPropertyDeclaration,
  FilterOutput,
  GradientOutput,
  LayerOutput,
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
  workspaceOwnerId: string | null;
  workspaceUpdatedAt: string | null;
  workspaceManualThumbnailAt: string | null;

  // Save status
  saveStatus: 'idle' | 'modified' | 'saving' | 'saved' | 'error';
  saveError: string | null;

  // User preferences
  preferences: Preferences;

  // Editor
  code: string;
  isModified: boolean;

  // Compilation results
  pathData: string;
  logs: LogEntry[];
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
  compilationStatus: 'idle' | 'compiling' | 'rendering' | 'completed' | 'error';
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
