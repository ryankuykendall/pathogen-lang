import type {
  ClipPathOutput,
  CSSPropertyDeclaration,
  GradientOutput,
  LayerOutput,
  LogEntry,
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
  annotatedOutput: string;
  logs: LogEntry[];
  error: string | null;
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  cssProperties: CSSPropertyDeclaration[];
  layerVisibility: Record<string, boolean>;
  defsVisibility: Record<string, boolean>;

  // Compilation status
  compilationStatus: 'idle' | 'compiling' | 'rendering' | 'completed' | 'error';
  compilationError: string | null;
  compilationId: number;
  calledStdlibFunctions: string[];

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
  annotatedOpen: boolean;
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
