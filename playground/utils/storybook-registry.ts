// Storybook component registry
// Defines all components available in the storybook with their stories and controls

interface StoryControl {
  name: string;
  type: string;
  label: string;
  default?: unknown;
  min?: number;
  max?: number;
}

interface Story {
  name: string;
  props: Record<string, unknown>;
}

interface ControlEvents {
  on(name: string, callback: (value: unknown) => void): void;
}

interface ComponentSpec {
  id: string;
  name: string;
  category: string;
  description: string;
  stories: Story[];
  controls: StoryControl[];
  notes?: string;
  render: (container: HTMLElement, props: Record<string, unknown>, controls: ControlEvents) => void;
}

export const componentRegistry: ComponentSpec[] = [
  // === Editor Core ===
  {
    id: 'code-editor-pane',
    name: 'Code Editor',
    category: 'Editor',
    description: 'CodeMirror 6-based code editor with syntax highlighting and autocomplete',
    stories: [
      {
        name: 'Default',
        props: { code: 'let r = 50;\ncircle(100, 100, r)' },
      },
      {
        name: 'Complex Example',
        props: {
          code: '// Star pattern\nlet n = 5;\nlet outer = 80;\nlet inner = 30;\nstar(100, 100, outer, inner, n)',
        },
      },
      {
        name: 'Empty',
        props: { code: '' },
      },
      {
        name: 'Color Formats',
        props: {
          code: `// Color formats demo
define PathLayer('hex') \${ stroke: #e63946; fill: #a8dadc; }
define PathLayer('rgb') \${ stroke: rgb(230, 57, 70); fill: rgba(168, 218, 220, 0.8); }
define PathLayer('hsl') \${ stroke: hsl(355, 78%, 56%); fill: hsla(184, 40%, 76%, 0.8); }
define PathLayer('oklch') \${ stroke: oklch(0.55 0.2 27); fill: oklch(0.85 0.05 195); }
define PathLayer('oklab') \${ stroke: oklab(0.55 0.15 0.05); fill: oklab(0.85 -0.04 -0.02); }

// Color() constructor calls
let primary = Color('#e63946');
let ocean = Color('steelblue');
let custom = Color('oklch(0.7 0.15 180)');

// CSSVar with color fallback
let themed = CSSVar('--accent', '#10b981');

layer('hex').apply { circle(60, 100, 40) }`,
        },
      },
    ],
    controls: [{ name: 'code', type: 'textarea', label: 'Code', default: 'let r = 50;\ncircle(100, 100, r)' }],
    render: (container, props, controls) => {
      const editor = document.createElement('code-editor-pane');
      editor.style.height = '300px';
      editor.style.width = '100%';
      editor.style.border = '1px solid var(--border-color, #ddd)';
      (editor as unknown as { _initialCode: string })._initialCode = (props.code as string) || '';
      container.appendChild(editor);

      // Update code when control changes
      controls.on('code', (value) => {
        (editor as unknown as { code: unknown }).code = value;
      });
    },
  },
  {
    id: 'svg-preview-pane',
    name: 'SVG Preview',
    category: 'Editor',
    description: 'SVG preview with zoom/pan controls and navigator',
    stories: [
      {
        name: 'Default',
        props: { pathData: 'M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100' },
      },
      {
        name: 'Complex Path',
        props: { pathData: 'M 100 10 L 40 198 L 190 78 L 10 78 L 160 198 Z' },
      },
      {
        name: 'Empty',
        props: { pathData: '' },
      },
    ],
    controls: [
      {
        name: 'pathData',
        type: 'textarea',
        label: 'Path Data',
        default: 'M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100',
      },
      { name: 'width', type: 'number', label: 'Width', default: 200, min: 50, max: 1000 },
      { name: 'height', type: 'number', label: 'Height', default: 200, min: 50, max: 1000 },
    ],
    render: (container, props, controls) => {
      // Need to import store for svg-preview-pane
      import('../state/store.js').then(({ store }) => {
        store.update({
          width: (props.width as number) || 200,
          height: (props.height as number) || 200,
          pathData: (props.pathData as string) || '',
        });

        const preview = document.createElement('svg-preview-pane');
        preview.style.height = '350px';
        preview.style.width = '100%';
        preview.style.border = '1px solid var(--border-color, #ddd)';
        container.appendChild(preview);

        // Give time for component to initialize
        setTimeout(() => {
          (preview as unknown as { pathData: string }).pathData = (props.pathData as string) || '';
        }, 100);

        controls.on('pathData', (value) => {
          (preview as unknown as { pathData: unknown }).pathData = value;
        });
        controls.on('width', (value) => {
          store.set('width', value);
        });
        controls.on('height', (value) => {
          store.set('height', value);
        });
      });
    },
  },
  {
    id: 'layers-panel',
    name: 'Layers Panel',
    category: 'Editor',
    description: 'Floating panel showing layer list with visibility toggles',
    stories: [
      {
        name: 'Multiple Layers',
        props: {
          layers: [
            { name: 'grid', type: 'path', data: '', styles: { stroke: '#dddddd', 'stroke-width': '0.5' } },
            { name: 'shape', type: 'path', data: '', styles: { stroke: '#333333', 'stroke-width': '2' } },
            { name: 'labels', type: 'text', data: '', styles: { fill: '#666666' }, textElements: [] },
          ],
        },
      },
      {
        name: 'Single Layer (Hidden)',
        props: {
          layers: [{ name: 'default', type: 'path', data: '', styles: { stroke: '#000000' } }],
        },
      },
    ],
    controls: [],
    notes: 'Reads layers and layerVisibility from store. Auto-hides when <= 1 layer.',
    render: (container, props) => {
      import('../state/store.js').then(({ store }) => {
        store.set('layers', props.layers || []);
        store.set('layerVisibility', {});

        const panel = document.createElement('layers-panel');
        // Override auto-hide for storybook display
        panel.style.display = 'block';
        panel.style.position = 'relative';
        container.appendChild(panel);
      });
    },
  },
  {
    id: 'palette-panel',
    name: 'Palette Panel',
    category: 'Editor',
    description: 'Floating panel showing all colors used in the current program, grouped by layer',
    stories: [
      {
        name: 'Multiple Layers with Colors',
        props: {
          layers: [
            {
              name: 'outline',
              type: 'path',
              data: '',
              styles: { stroke: '#e63946', 'stroke-width': '2', fill: 'none' },
            },
            { name: 'background', type: 'path', data: '', styles: { stroke: 'none', fill: '#a8dadc' } },
            {
              name: 'accent',
              type: 'path',
              data: '',
              styles: { stroke: 'steelblue', fill: 'rgba(70, 130, 180, 0.3)' },
            },
          ],
        },
      },
      {
        name: 'With CSS Variables',
        props: {
          layers: [
            {
              name: 'themed',
              type: 'path',
              data: '',
              styles: { stroke: 'var(--primary, #e63946)', fill: 'var(--bg, #f1faee)' },
            },
            { name: 'static', type: 'path', data: '', styles: { stroke: '#333', fill: 'none' } },
          ],
        },
      },
      {
        name: 'Empty (Hidden)',
        props: {
          layers: [{ name: 'default', type: 'path', data: '', styles: { 'stroke-width': '2' } }],
        },
      },
    ],
    controls: [],
    notes: 'Reads layers from store. Shows color swatches grouped by layer. Auto-hides when no colors found.',
    render: (container, props) => {
      import('../state/store.js').then(({ store }) => {
        store.set('layers', props.layers || []);

        const panel = document.createElement('palette-panel');
        panel.style.display = 'block';
        panel.style.position = 'relative';
        container.appendChild(panel);
      });
    },
  },
  {
    id: 'cssvar-panel',
    name: 'CSS Variable Panel',
    category: 'Editor',
    description: 'Floating panel for live CSS variable overrides in SVG preview',
    stories: [
      {
        name: 'Color Variables',
        props: {
          layers: [
            {
              name: 'shape',
              type: 'path',
              data: '',
              styles: { stroke: 'var(--primary, #e63946)', fill: 'var(--bg, #f1faee)' },
            },
            { name: 'accent', type: 'path', data: '', styles: { stroke: 'var(--accent, steelblue)', fill: 'none' } },
          ],
        },
      },
      {
        name: 'Mixed Variables',
        props: {
          layers: [
            {
              name: 'main',
              type: 'path',
              data: '',
              styles: { stroke: 'var(--color, #333)', 'stroke-width': 'var(--width, 2)' },
            },
          ],
        },
      },
      {
        name: 'No Variables (Hidden)',
        props: {
          layers: [{ name: 'default', type: 'path', data: '', styles: { stroke: '#000', fill: 'none' } }],
        },
      },
    ],
    controls: [],
    notes:
      'Reads layers from store. Extracts var() references and provides live override inputs. Auto-hides when no vars found.',
    render: (container, props) => {
      import('../state/store.js').then(({ store }) => {
        store.set('layers', props.layers || []);

        const panel = document.createElement('cssvar-panel');
        panel.style.display = 'block';
        panel.style.position = 'relative';
        container.appendChild(panel);
      });
    },
  },
  {
    id: 'console-pane',
    name: 'Console',
    category: 'Editor',
    description: 'Console log output display with expandable entries',
    stories: [
      {
        name: 'With Logs',
        props: {
          isOpen: true,
          logs: [
            { line: 1, parts: [{ type: 'string', value: 'Starting render...' }] },
            { line: 3, parts: [{ type: 'value', label: 'radius', value: '50' }] },
            { line: 5, parts: [{ type: 'value', label: 'result', value: '{"x": 100, "y": 100}' }] },
          ],
        },
      },
      {
        name: 'Empty',
        props: { isOpen: true, logs: [] },
      },
      {
        name: 'Collapsed',
        props: { isOpen: false, logs: [] },
      },
    ],
    controls: [{ name: 'isOpen', type: 'toggle', label: 'Open', default: true }],
    render: (container, props, controls) => {
      const consolePane = document.createElement('console-pane');
      consolePane.style.height = '250px';
      consolePane.style.width = '100%';
      consolePane.style.border = '1px solid var(--border-color, #ddd)';
      container.appendChild(consolePane);

      if (props.isOpen) {
        (consolePane as unknown as { open(): void }).open();
      }
      (consolePane as unknown as { logs: unknown }).logs = props.logs || [];

      controls.on('isOpen', (value) => {
        if (value) {
          (consolePane as unknown as { open(): void }).open();
        } else {
          (consolePane as unknown as { close(): void }).close();
        }
      });
    },
  },
  {
    id: 'error-panel',
    name: 'Error Panel',
    category: 'Editor',
    description: 'Error message display banner',
    stories: [
      {
        name: 'With Error',
        props: { message: 'SyntaxError: Unexpected token at line 5, column 12' },
      },
      {
        name: 'Long Error',
        props: {
          message:
            'ReferenceError: "myVariable" is not defined. Did you mean "myVar"? Check your variable declarations and ensure all variables are properly initialized before use.',
        },
      },
      {
        name: 'Hidden',
        props: { message: '' },
      },
    ],
    controls: [
      { name: 'message', type: 'text', label: 'Error Message', default: 'SyntaxError: Unexpected token at line 5' },
    ],
    render: (container, props, controls) => {
      const errorPanel = document.createElement('error-panel');
      errorPanel.style.width = '100%';
      if (props.message) {
        (errorPanel as unknown as { message: unknown }).message = props.message;
      }
      container.appendChild(errorPanel);

      controls.on('message', (value) => {
        (errorPanel as unknown as { message: unknown }).message = value;
      });
    },
  },

  // === Editor Support ===
  {
    id: 'annotated-pane',
    name: 'Annotated Output',
    category: 'Editor',
    description: 'Read-only display showing annotated path output',
    stories: [
      {
        name: 'With Content',
        props: {
          isOpen: true,
          content:
            '// Generated SVG Path\nM 50 100  // Move to start\nA 50 50 0 1 1 150 100  // Arc to right\nA 50 50 0 1 1 50 100   // Arc back to start',
        },
      },
      {
        name: 'Empty',
        props: { isOpen: true, content: '' },
      },
    ],
    controls: [
      { name: 'isOpen', type: 'toggle', label: 'Open', default: true },
      { name: 'content', type: 'textarea', label: 'Content', default: 'M 50 100\nL 100 50\nL 150 100\nZ' },
    ],
    render: (container, props, controls) => {
      const pane = document.createElement('annotated-pane');
      pane.style.height = '250px';
      pane.style.width = '100%';
      pane.style.border = '1px solid var(--border-color, #ddd)';
      container.appendChild(pane);

      // Set content before opening (so editor initializes with content)
      (pane as unknown as { _content: unknown })._content = props.content || '';

      if (props.isOpen) {
        (pane as unknown as { open(): void }).open();
      }

      controls.on('isOpen', (value) => {
        if (value) (pane as unknown as { open(): void }).open();
        else (pane as unknown as { close(): void }).close();
      });
      controls.on('content', (value) => {
        (pane as unknown as { content: unknown }).content = value;
      });
    },
  },
  {
    id: 'playground-header',
    name: 'Playground Header',
    category: 'Editor',
    description: 'Editor header with file controls, pane toggles, and examples dropdown',
    stories: [
      {
        name: 'Default',
        props: { fileName: null, isModified: false, annotatedOpen: false, consoleOpen: false },
      },
      {
        name: 'With File',
        props: { fileName: 'my-drawing.svg', isModified: false, annotatedOpen: false, consoleOpen: false },
      },
      {
        name: 'Modified',
        props: { fileName: 'my-drawing.svg', isModified: true, annotatedOpen: false, consoleOpen: false },
      },
      {
        name: 'Panes Open',
        props: { fileName: null, isModified: false, annotatedOpen: true, consoleOpen: true },
      },
    ],
    controls: [
      { name: 'fileName', type: 'text', label: 'File Name', default: '' },
      { name: 'isModified', type: 'toggle', label: 'Modified', default: false },
      { name: 'annotatedOpen', type: 'toggle', label: 'Annotated Open', default: false },
      { name: 'consoleOpen', type: 'toggle', label: 'Console Open', default: false },
    ],
    render: (container, props, controls) => {
      import('../state/store.js').then(({ store }) => {
        // Set initial store state
        (store as any).update({
          currentFileName: (props.fileName as string) || null,
          isModified: (props.isModified as boolean) || false,
          annotatedOpen: (props.annotatedOpen as boolean) || false,
          consoleOpen: (props.consoleOpen as boolean) || false,
        });

        const header = document.createElement('playground-header');
        header.style.width = '100%';
        header.style.border = '1px solid var(--border-color, #ddd)';
        container.appendChild(header);

        controls.on('fileName', (value) => {
          store.set('currentFileName', (value as string) || null);
        });
        controls.on('isModified', (value) => {
          store.set('isModified', value);
        });
        controls.on('annotatedOpen', (value) => {
          store.set('annotatedOpen', value);
        });
        controls.on('consoleOpen', (value) => {
          store.set('consoleOpen', value);
        });
      });
    },
  },
  {
    id: 'playground-footer',
    name: 'Playground Footer',
    category: 'Editor',
    description: 'SVG styling controls (dimensions, stroke, fill, background, grid)',
    stories: [
      {
        name: 'Default',
        props: {},
      },
    ],
    controls: [],
    render: (container) => {
      import('../state/store.js').then(({ store }) => {
        // Reset store to defaults for clean demo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (store as any).update({
          width: 200,
          height: 200,
          stroke: '#000000',
          strokeWidth: 2,
          fillEnabled: false,
          fill: '#3498db',
          background: '#f5f5f5',
          gridEnabled: true,
          gridColor: '#cccccc',
          gridSize: 20,
        });

        const footer = document.createElement('playground-footer');
        footer.style.width = '100%';
        footer.style.border = '1px solid var(--border-color, #ddd)';
        container.appendChild(footer);
      });
    },
  },
  {
    id: 'docs-panel',
    name: 'Docs Panel',
    category: 'Editor',
    description: 'Slide-out documentation panel with tabbed content',
    stories: [
      {
        name: 'Open',
        props: { isOpen: true },
      },
      {
        name: 'Closed',
        props: { isOpen: false },
      },
    ],
    controls: [{ name: 'isOpen', type: 'toggle', label: 'Open', default: true }],
    render: (container, props, controls) => {
      // Create a relative container for the panel
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      wrapper.style.height = '400px';
      wrapper.style.overflow = 'hidden';
      wrapper.style.border = '1px solid var(--border-color, #ddd)';
      wrapper.style.background = 'var(--bg-secondary, #f5f5f5)';
      container.appendChild(wrapper);

      const panel = document.createElement('docs-panel');
      // Override fixed positioning for storybook demo
      panel.style.position = 'absolute';
      panel.style.width = '100%';
      panel.style.height = '100%';
      wrapper.appendChild(panel);

      if (props.isOpen) {
        setTimeout(() => (panel as unknown as { open(): void }).open(), 50);
      }

      controls.on('isOpen', (value) => {
        if (value) (panel as unknown as { open(): void }).open();
        else (panel as unknown as { close(): void }).close();
      });
    },
  },

  // === Navigation ===
  {
    id: 'app-header',
    name: 'App Header',
    category: 'Navigation',
    description: 'Top navigation bar with logo, nav links, and actions',
    stories: [
      {
        name: 'Default',
        props: {},
      },
    ],
    controls: [],
    render: (container) => {
      // Note: We don't modify currentView in the store as it would affect the entire app
      const header = document.createElement('app-header');
      header.style.width = '100%';
      header.style.border = '1px solid var(--border-color, #ddd)';
      container.appendChild(header);

      // Prevent navigation events from bubbling up in storybook
      header.addEventListener('navigate', (e) => {
        e.stopPropagation();
      });

      const note = document.createElement('div');
      note.style.padding = '8px';
      note.style.fontSize = '0.75rem';
      note.style.color = 'var(--text-secondary, #666)';
      note.style.fontStyle = 'italic';
      note.style.marginTop = '8px';
      note.textContent = 'Note: Navigation links are disabled in this demo. Active state reflects current app view.';
      container.appendChild(note);
    },
  },
  {
    id: 'app-breadcrumb',
    name: 'App Breadcrumb',
    category: 'Navigation',
    description: 'Breadcrumb navigation trail showing current location',
    stories: [
      {
        name: 'Default',
        props: {},
      },
    ],
    controls: [],
    render: (container) => {
      // Note: We don't modify currentView in the store as it would affect the entire app
      const breadcrumb = document.createElement('app-breadcrumb');
      breadcrumb.style.width = '100%';
      breadcrumb.style.border = '1px solid var(--border-color, #ddd)';
      container.appendChild(breadcrumb);

      // Prevent navigation events from bubbling up in storybook
      breadcrumb.addEventListener('navigate', (e) => {
        e.stopPropagation();
      });

      const note = document.createElement('div');
      note.style.padding = '8px';
      note.style.fontSize = '0.75rem';
      note.style.color = 'var(--text-secondary, #666)';
      note.style.fontStyle = 'italic';
      note.style.marginTop = '8px';
      note.textContent =
        'Note: Shows breadcrumb for current storybook view. Navigation links are disabled in this demo.';
      container.appendChild(note);
    },
  },

  // === Shared Components ===
  {
    id: 'copy-button',
    name: 'Copy Button',
    category: 'Shared',
    description: 'Copy to clipboard button with confirmation feedback',
    stories: [
      {
        name: 'Default',
        props: { text: 'Hello, World!', label: 'Copy' },
      },
      {
        name: 'Custom Label',
        props: { text: 'Some code here', label: 'Copy Code' },
      },
    ],
    controls: [
      { name: 'text', type: 'text', label: 'Text to Copy', default: 'Hello, World!' },
      { name: 'label', type: 'text', label: 'Button Label', default: 'Copy' },
    ],
    render: (container, props, controls) => {
      const btn = document.createElement('copy-button');
      btn.setAttribute('text', (props.text as string) || '');
      btn.setAttribute('label', (props.label as string) || 'Copy');
      container.appendChild(btn);

      controls.on('text', (value) => btn.setAttribute('text', value as string));
      controls.on('label', (value) => btn.setAttribute('label', value as string));
    },
  },
  {
    id: 'log-entry',
    name: 'Log Entry',
    category: 'Shared',
    description: 'Expandable log entry for console output',
    stories: [
      {
        name: 'String Output',
        props: {
          data: { line: 1, parts: [{ type: 'string', value: 'Hello from the console!' }] },
        },
      },
      {
        name: 'Labeled Value',
        props: {
          data: { line: 5, parts: [{ type: 'value', label: 'myVar', value: '42' }] },
        },
      },
      {
        name: 'Object Value',
        props: {
          data: {
            line: 10,
            parts: [
              {
                type: 'value',
                label: 'config',
                value: '{"width": 200, "height": 200, "stroke": "#000"}',
              },
            ],
          },
        },
      },
      {
        name: 'Array Value',
        props: {
          data: {
            line: 15,
            parts: [
              {
                type: 'value',
                label: 'points',
                value: '[10, 20, 30, 40, 50]',
              },
            ],
          },
        },
      },
    ],
    controls: [],
    render: (container, props) => {
      // Dark background to match console
      container.style.background = '#1e1e1e';
      container.style.padding = '12px';
      container.style.borderRadius = '4px';

      const entry = document.createElement('log-entry');
      (entry as unknown as { data: unknown }).data = props.data;
      container.appendChild(entry);
    },
  },
  {
    id: 'control-group',
    name: 'Control Group',
    category: 'Shared',
    description: 'Form control wrapper with label',
    stories: [
      {
        name: 'Number Input',
        props: { label: 'Width', inputType: 'number', value: 200 },
      },
      {
        name: 'Color Input',
        props: { label: 'Stroke', inputType: 'color', value: '#000000' },
      },
      {
        name: 'Checkbox',
        props: { label: 'Grid Enabled', inputType: 'checkbox', checked: true },
      },
    ],
    controls: [{ name: 'label', type: 'text', label: 'Label', default: 'Width' }],
    render: (container, props, controls) => {
      const group = document.createElement('control-group');
      group.setAttribute('label', (props.label as string) || '');

      let input: HTMLInputElement;
      if (props.inputType === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = (props.checked as boolean) || false;
      } else if (props.inputType === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = (props.value as string) || '#000000';
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.value = String(props.value || 0);
      }

      group.appendChild(input);
      container.appendChild(group);

      controls.on('label', (value) => group.setAttribute('label', value as string));
    },
  },

  // === UI Patterns (migrated from old storybook) ===
  {
    id: 'ui-buttons',
    name: 'Buttons',
    category: 'UI Patterns',
    description: 'Primary and secondary action buttons',
    stories: [{ name: 'All Variants', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="demo-button primary">Primary</button>
          <button class="demo-button secondary">Secondary</button>
          <button class="demo-button primary" disabled>Disabled</button>
        </div>
        <style>
          .demo-button {
            padding: 0.5rem 1rem;
            border-radius: 4px;
            font-size: 0.875rem;
            cursor: pointer;
            font-family: inherit;
          }
          .demo-button.primary {
            background: var(--accent-color, #0066cc);
            color: white;
            border: none;
          }
          .demo-button.primary:hover:not(:disabled) {
            background: var(--accent-hover, #0052a3);
          }
          .demo-button.secondary {
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #1a1a1a);
            border: 1px solid var(--border-color, #e0e0e0);
          }
          .demo-button.secondary:hover:not(:disabled) {
            background: var(--bg-secondary, #f5f5f5);
          }
          .demo-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        </style>
      `;
    },
  },
  {
    id: 'ui-inputs',
    name: 'Text Inputs',
    category: 'UI Patterns',
    description: 'Standard text input fields',
    stories: [{ name: 'All Variants', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <input type="text" class="demo-input" placeholder="Enter text...">
          <input type="text" class="demo-input" value="With value">
          <input type="text" class="demo-input" disabled placeholder="Disabled">
        </div>
        <style>
          .demo-input {
            padding: 0.5rem;
            border: 1px solid var(--border-color, #e0e0e0);
            border-radius: 4px;
            font-size: 0.875rem;
            font-family: inherit;
            width: 200px;
          }
          .demo-input:focus {
            outline: none;
            border-color: var(--accent-color, #0066cc);
          }
          .demo-input:disabled {
            background: var(--bg-secondary, #f5f5f5);
            opacity: 0.7;
          }
        </style>
      `;
    },
  },
  {
    id: 'ui-toggles',
    name: 'Toggle Groups',
    category: 'UI Patterns',
    description: 'Mutually exclusive option selector',
    stories: [{ name: 'Default', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div class="demo-toggle">
          <button>List</button>
          <button class="active">Grid</button>
          <button>Table</button>
        </div>
        <style>
          .demo-toggle {
            display: flex;
            border: 1px solid var(--border-color, #e0e0e0);
            border-radius: 4px;
            overflow: hidden;
          }
          .demo-toggle button {
            padding: 0.5rem 1rem;
            border: none;
            background: var(--bg-primary, #ffffff);
            cursor: pointer;
            font-size: 0.8125rem;
            font-family: inherit;
          }
          .demo-toggle button:not(:last-child) {
            border-right: 1px solid var(--border-color, #e0e0e0);
          }
          .demo-toggle button.active {
            background: var(--accent-color, #0066cc);
            color: white;
          }
          .demo-toggle button:hover:not(.active) {
            background: var(--bg-secondary, #f5f5f5);
          }
        </style>
      `;

      // Add interactivity
      container.querySelectorAll('.demo-toggle button').forEach((btn) => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.demo-toggle button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    },
  },
  {
    id: 'ui-colors',
    name: 'Color Pickers',
    category: 'UI Patterns',
    description: 'Color input with value display',
    stories: [{ name: 'Default', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div class="demo-color-group">
            <pathogen-color-input class="demo-color" compact value="#0066cc"></pathogen-color-input>
            <span class="color-value">#0066cc</span>
          </div>
          <div class="demo-color-group">
            <pathogen-color-input class="demo-color" compact value="#28a745"></pathogen-color-input>
            <span class="color-value">#28a745</span>
          </div>
        </div>
        <style>
          .demo-color-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .demo-color {
            width: 36px;
            height: 30px;
            border-radius: 4px;
          }
          .color-value {
            font-family: var(--font-mono, monospace);
            font-size: 0.8125rem;
          }
        </style>
      `;

      container.querySelectorAll('.demo-color').forEach((input) => {
        input.addEventListener('color-change', (e) => {
          const target = e.target as HTMLElement;
          const value = (e as CustomEvent<{ value: string }>).detail.value;
          (target.nextElementSibling as HTMLElement).textContent = value;
        });
      });
    },
  },
  {
    id: 'pathogen-color-input',
    name: 'Pathogen Color Input',
    category: 'Form Controls',
    description:
      'Themed wrapper around <color-input> (hdr-color-input). Supports wide-gamut spaces (hex, srgb, hsl, oklch, oklab, display-p3, rec2020, lab, lch, hwb), alpha, and eye-dropper. Emits a composed `color-change` event.',
    stories: [
      { name: 'Default (hex)', props: { value: '#3498db' } },
      { name: 'OKLCH', props: { value: 'oklch(0.7 0.15 180)', colorspace: 'oklch' } },
      { name: 'No Alpha', props: { value: '#e63946', 'no-alpha': true } },
      { name: 'Display-P3', props: { value: 'color(display-p3 1 0 0)', colorspace: 'display-p3' } },
    ],
    controls: [
      { name: 'value', type: 'text', label: 'Value', default: '#3498db' },
      {
        name: 'colorspace',
        type: 'select',
        label: 'Colorspace',
        default: 'hex',
      },
      { name: 'no-alpha', type: 'checkbox', label: 'No alpha', default: false },
    ],
    render: (container, props, controls) => {
      container.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center;">
          <pathogen-color-input
            value="${props.value ?? '#3498db'}"
            ${props.colorspace ? `colorspace="${props.colorspace}"` : ''}
            ${props['no-alpha'] ? 'no-alpha' : ''}
          ></pathogen-color-input>
          <pre class="demo-readout"
               style="margin: 0; padding: 0.5rem 0.75rem; background: var(--bg-secondary, #f5f5f5); border-radius: 4px; font-family: var(--font-mono, monospace); font-size: 0.8125rem;">Listening for color-change…</pre>
        </div>
      `;

      const picker = container.querySelector('pathogen-color-input') as HTMLElement & {
        value: string;
        colorspace: string;
        noAlpha: boolean;
      };
      const readout = container.querySelector('.demo-readout') as HTMLElement;

      picker.addEventListener('color-change', (e) => {
        const detail = (e as CustomEvent).detail;
        readout.textContent = JSON.stringify(detail, null, 2);
      });

      controls.on('value', (v) => {
        picker.value = v as string;
      });
      controls.on('colorspace', (v) => {
        picker.colorspace = v as string;
      });
      controls.on('no-alpha', (v) => {
        picker.noAlpha = Boolean(v);
      });
    },
  },
  {
    id: 'ui-typography',
    name: 'Typography',
    category: 'UI Patterns',
    description: 'Text styles and hierarchy',
    stories: [{ name: 'Scale', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-size: 1.5rem; font-weight: 600;">Heading 1 (1.5rem)</div>
          <div style="font-size: 1.25rem; font-weight: 600;">Heading 2 (1.25rem)</div>
          <div style="font-size: 1rem; font-weight: 600;">Heading 3 (1rem)</div>
          <div style="font-size: 0.875rem;">Body text (0.875rem)</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary, #666);">Caption text (0.75rem)</div>
          <div style="font-family: var(--font-mono, monospace); font-size: 0.875rem;">Monospace text</div>
        </div>
      `;
    },
  },
  {
    id: 'ui-colors-palette',
    name: 'Color Palette',
    category: 'UI Patterns',
    description: 'Theme colors from CSS variables',
    stories: [{ name: 'Default', props: {} }],
    controls: [],
    render: (container) => {
      const colors = [
        { name: 'accent', var: '--accent-color', fallback: '#0066cc' },
        { name: 'text-primary', var: '--text-primary', fallback: '#1a1a1a' },
        { name: 'text-secondary', var: '--text-secondary', fallback: '#666' },
        { name: 'bg-primary', var: '--bg-primary', fallback: '#ffffff' },
        { name: 'bg-secondary', var: '--bg-secondary', fallback: '#f5f5f5' },
        { name: 'border', var: '--border-color', fallback: '#e0e0e0' },
        { name: 'success', var: '--success-color', fallback: '#28a745' },
        { name: 'error', var: '--error-text', fallback: '#c00' },
      ];

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.75rem;">
          ${colors
            .map(
              (c) => `
            <div style="text-align: center;">
              <div style="width: 50px; height: 50px; background: var(${c.var}, ${c.fallback}); border-radius: 4px; margin: 0 auto; border: 1px solid var(--border-color, #e0e0e0);"></div>
              <div style="font-size: 0.6875rem; margin-top: 0.25rem; color: var(--text-secondary, #666);">${c.name}</div>
            </div>
          `,
            )
            .join('')}
        </div>
      `;
    },
  },
  {
    id: 'ui-spacing',
    name: 'Spacing Scale',
    category: 'UI Patterns',
    description: 'Consistent spacing units',
    stories: [{ name: 'Default', props: {} }],
    controls: [],
    render: (container) => {
      const spacings = [
        { label: '0.25rem (4px)', size: '4px' },
        { label: '0.5rem (8px)', size: '8px' },
        { label: '0.75rem (12px)', size: '12px' },
        { label: '1rem (16px)', size: '16px' },
        { label: '1.5rem (24px)', size: '24px' },
        { label: '2rem (32px)', size: '32px' },
      ];

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${spacings
            .map(
              (s) => `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: ${s.size}; height: 16px; background: var(--accent-color, #0066cc);"></div>
              <span style="font-size: 0.75rem; color: var(--text-secondary, #666);">${s.label}</span>
            </div>
          `,
            )
            .join('')}
        </div>
      `;
    },
  },
  // === Blog ===
  {
    id: 'mini-workspace',
    name: 'Mini Workspace',
    category: 'Blog',
    description: 'Display-only code+preview embed for blog posts with pannable/zoomable SVG',
    stories: [
      {
        name: 'Default (code closed)',
        props: { codeOpen: false },
      },
      {
        name: 'Code Open',
        props: { codeOpen: true },
      },
      {
        name: 'With Caption',
        props: { codeOpen: false, caption: 'A simple circle drawn with Pathogen' },
      },
      {
        name: 'With CSS Vars',
        props: {
          codeOpen: false,
          withVars: true,
          caption: 'Click a color chip in the control bar to recolor the SVG — exercises <pathogen-color-input> in the blog embed.',
        },
      },
    ],
    controls: [{ name: 'codeOpen', type: 'toggle', label: 'Code Open', default: false }],
    render: (container, props, controls) => {
      const withVars = Boolean(props.withVars);

      const plainCode = `let r = 50;
let cx = 100;
let cy = 100;

circle(cx, cy, r)`;
      const plainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="#ffffff"/>
  <circle cx="100" cy="100" r="50" stroke="#000000" stroke-width="2" fill="none"/>
</svg>`;

      // CSS-var variant: fill and stroke reference --bg-color, --ring-color,
      // --dot-color so the color chips in the mini-workspace chrome can
      // recolor the embedded SVG at runtime.
      const varsCode = `// Background, ring, and dot colors are CSS-var driven
let bg = PathLayer('bg') \${ fill: var(--bg-color, #f1faee); stroke: none; };
bg.apply { rect(0, 0, 200, 200); }

let ring = PathLayer('ring') \${ stroke: var(--ring-color, #e63946); stroke-width: 6; fill: none; };
ring.apply { circle(100, 100, 60); }

let dot = PathLayer('dot') \${ fill: var(--dot-color, #1d3557); stroke: none; };
dot.apply { circle(100, 100, 14); }`;
      const varsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="var(--bg-color, #f1faee)"/>
  <circle cx="100" cy="100" r="60" stroke="var(--ring-color, #e63946)" stroke-width="6" fill="none"/>
  <circle cx="100" cy="100" r="14" fill="var(--dot-color, #1d3557)"/>
</svg>`;

      const sampleCode = withVars ? varsCode : plainCode;
      const sampleSvg = withVars ? varsSvg : plainSvg;

      // mini-workspace reads code from a child <pre><code> (or <code>) and
      // the preview SVG from a child <svg>. Escape `<` in the code so it
      // doesn't break the inline <pre><code> block.
      const escapedCode = sampleCode.replace(/[&<]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;' })[c] as string,
      );
      const el = document.createElement('mini-workspace');
      if (withVars) {
        el.setAttribute('vars', '--bg-color:#f1faee;--ring-color:#e63946;--dot-color:#1d3557');
      }
      if (props.codeOpen) el.setAttribute('code-open', '');
      if (props.caption) el.setAttribute('caption', props.caption as string);
      el.innerHTML = `<pre><code>${escapedCode}</code></pre>${sampleSvg}`;
      el.style.maxWidth = '700px';

      container.appendChild(el);

      controls.on('codeOpen', (value) => {
        if (value) {
          el.setAttribute('code-open', '');
        } else {
          el.removeAttribute('code-open');
        }
      });
    },
  },
  {
    id: 'ui-cards',
    name: 'Cards',
    category: 'UI Patterns',
    description: 'Container for grouped content',
    stories: [{ name: 'Default', props: {} }],
    controls: [],
    render: (container) => {
      container.innerHTML = `
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <div class="demo-card">
            <h3>Card Title</h3>
            <p>Card description text goes here with some content.</p>
          </div>
          <div class="demo-card">
            <h3>Another Card</h3>
            <p>Different content for this card example.</p>
          </div>
        </div>
        <style>
          .demo-card {
            background: var(--bg-primary, #ffffff);
            padding: 1rem;
            border: 1px solid var(--border-color, #e0e0e0);
            border-radius: 8px;
            width: 200px;
          }
          .demo-card h3 {
            margin: 0 0 0.5rem 0;
            font-size: 0.875rem;
            font-weight: 600;
          }
          .demo-card p {
            margin: 0;
            font-size: 0.75rem;
            color: var(--text-secondary, #666);
          }
        </style>
      `;
    },
  },
];

// Get component by ID
export function getComponentById(id: string): ComponentSpec | undefined {
  return componentRegistry.find((c) => c.id === id);
}

// Get all categories
export function getCategories(): Map<string, ComponentSpec[]> {
  const categories = new Map<string, ComponentSpec[]>();
  for (const component of componentRegistry) {
    if (!categories.has(component.category)) {
      categories.set(component.category, []);
    }
    categories.get(component.category)!.push(component);
  }
  return categories;
}

// Get first component (for default view)
export function getFirstComponent(): ComponentSpec {
  return componentRegistry[0];
}
