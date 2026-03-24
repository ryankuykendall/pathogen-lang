// Observable state store for playground
// Simple pub/sub pattern - no framework needed

type StoreCallback = (value: unknown, key: string) => void;

function createStore<T extends Record<string, unknown>>(initialState: T) {
  const state = { ...initialState };
  const listeners = new Map<string, Set<StoreCallback>>(); // key -> Set of callbacks

  return {
    get(key: string) {
      return state[key];
    },

    getAll() {
      return { ...state };
    },

    set(key: string, value: unknown) {
      if (state[key] !== value) {
        (state as Record<string, unknown>)[key] = value;
        this.notify(key);
      }
    },

    update(updates: Partial<T>) {
      const changedKeys: string[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (state[key] !== value) {
          (state as Record<string, unknown>)[key] = value;
          changedKeys.push(key);
        }
      }
      changedKeys.forEach((key) => this.notify(key));
    },

    subscribe(keys: string | string[], callback: StoreCallback) {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach((key) => {
        if (!listeners.has(key)) {
          listeners.set(key, new Set());
        }
        listeners.get(key)!.add(callback);
      });

      // Return unsubscribe function
      return () => {
        keyArray.forEach((key) => {
          listeners.get(key)?.delete(callback);
        });
      };
    },

    notify(key: string) {
      listeners.get(key)?.forEach((callback) => callback(state[key], key));
    },

    // Batch updates without intermediate notifications
    batch(fn: (state: T) => void) {
      const oldState = { ...state };
      fn(state);
      const changedKeys = Object.keys(state).filter((k) => state[k] !== oldState[k]);
      changedKeys.forEach((key) => this.notify(key));
    },
  };
}

// Main playground store
export const store = createStore({
  // Routing
  currentRoute: '/',
  currentView: 'landing',
  routeParams: {}, // e.g., { id: 'workspace-123' }
  routeQuery: {}, // e.g., { state: 'base64...' }

  // Workspaces
  workspaces: [], // Array of saved workspace metadata
  workspacesLoading: false,
  workspacesError: null,

  // Current workspace (loaded from API)
  workspaceId: null, // ID of current workspace (null = unsaved)
  workspaceName: null, // Name of current workspace
  workspaceDescription: null, // Description
  workspaceIsPublic: false, // Visibility
  workspaceOwnerId: null, // Owner user ID
  workspaceUpdatedAt: null, // Last update timestamp

  // Save status for autosave
  saveStatus: 'idle', // 'idle', 'modified', 'saving', 'saved', 'error'
  saveError: null, // Error message if save failed
  multiTabWarning: false, // True when same workspace is open in another tab

  // User preferences (defaults for new workspaces)
  preferences: {
    width: 200,
    height: 200,
    background: '#f5f5f5',
    gridEnabled: true,
    gridColor: '#cccccc',
    gridSize: 20,
    toFixed: null,
  },

  // Editor
  code: '',
  isModified: false,

  // Compilation results
  pathData: '',
  annotatedOutput: '',
  logs: [],
  error: null,
  layers: [], // Array of LayerOutput from last compilation
  masks: [], // Array of MaskOutput from last compilation
  clipPaths: [], // Array of ClipPathOutput from last compilation
  gradients: [], // Array of GradientOutput from last compilation
  patterns: [], // Array of PatternOutput from last compilation
  cssProperties: [], // Array of CSSPropertyDeclaration from last compilation
  layerVisibility: {}, // { [layerName]: boolean } — true = visible (default)
  defsVisibility: {}, // { ['mask:id'|'clip-path:id']: boolean } — true = visible (default)

  // Compilation status (for async worker)
  compilationStatus: 'idle', // 'idle', 'compiling', 'rendering', 'completed', 'error'
  compilationError: null,
  compilationId: 0, // Tracks current compilation for staleness detection
  calledStdlibFunctions: [], // Stdlib function names invoked during last compilation

  // SVG styles
  width: 200,
  height: 200,
  background: '#f5f5f5',
  gridEnabled: true,
  gridColor: '#cccccc',
  gridSize: 20,
  toFixed: null,

  // Zoom/pan
  zoomLevel: 1,
  panX: 0,
  panY: 0,

  // Pane visibility
  annotatedOpen: false,
  consoleOpen: false,
  docsOpen: false,
  inspectorOpen: false,

  // File state
  currentFileName: null,
  currentFileHandle: null,
});

export { createStore };
