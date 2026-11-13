// Storybook component registry
// Defines all components available in the storybook with their stories and controls

import type { CanvasSettings } from '../components/canvas-panel.js';
import type { ProgramItem } from '../services/program-list.js';

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
  on: (name: string, callback: (value: unknown) => void) => void;
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

// Deterministic sample artwork for the snapshot stories: rings in a seeded
// layout, as an SVG data URL (stand-in for a real card PNG).
function STORY_ART(seed: number): string {
  let state = (seed * 7919 + 13) >>> 0 || 1;
  const rand = (): number => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const palettes = [['#1c1722'], ['#c0518e', '#6d3aa6'], ['#e89254', '#1c1722'], ['#3d6b9e', '#5a8a72']];
  const pal = palettes[seed % palettes.length];
  let body = '';
  const count = 6 + Math.floor(rand() * 6);
  for (let i = 0; i < count; i++) {
    body += `<circle cx="${(40 + rand() * 320).toFixed(0)}" cy="${(40 + rand() * 320).toFixed(0)}" r="${(18 + rand() * 34).toFixed(0)}" fill="none" stroke="${pal[i % pal.length]}" stroke-width="${(5 + rand() * 6).toFixed(0)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#fff"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
define PathLayer('hex') #{ stroke: #e63946; fill: #a8dadc; }
define PathLayer('rgb') #{ stroke: rgb(230, 57, 70); fill: rgba(168, 218, 220, 0.8); }
define PathLayer('hsl') #{ stroke: hsl(355, 78%, 56%); fill: hsla(184, 40%, 76%, 0.8); }
define PathLayer('oklch') #{ stroke: oklch(0.55 0.2 27); fill: oklch(0.85 0.05 195); }
define PathLayer('oklab') #{ stroke: oklab(0.55 0.15 0.05); fill: oklab(0.85 -0.04 -0.02); }

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
    id: 'editor-tabs',
    name: 'Editor Tabs',
    category: 'Editor',
    description:
      'The tabs above the editor, one per open file (docs/workspace-files.md). Labels leave out .pathogen; two open files with one name add their folder (gears · parts). Icons: program, module (module;), pathogen.json with a lock. Close ×, and middle-click, close a tab; the last tab stays. Docs at the right end. Arrow keys, Home and End move between tabs; Delete closes one.',
    stories: [
      // docsOpen in each: the storybook keeps a control's value from the story before.
      { name: 'A new workspace (one tab)', props: { set: 'one', docsOpen: false } },
      { name: 'Two files named gears', props: { set: 'gears', active: 'demos/gears.pathogen', docsOpen: false } },
      { name: 'Docs open', props: { set: 'gears', active: 'main.pathogen', docsOpen: true } },
      { name: 'pathogen.json open', props: { set: 'json', active: 'pathogen.json', docsOpen: false } },
      {
        name: 'More tabs than fit',
        props: { set: 'many', active: 'shapes/star-9.pathogen', width: 520, docsOpen: false },
      },
    ],
    controls: [{ name: 'docsOpen', type: 'toggle', label: 'Docs open', default: false }],
    notes:
      'Clicking a tab, its ×, or Docs here updates the story, as workspace-view does (tab-select, tab-close, toggle-docs).',
    render: (container, props, controls) => {
      const loaded = Promise.all([import('../components/editor-tabs.js'), import('../services/open-files.js')]);
      loaded
        .then(([, { tabItems, afterTabClosed }]) => {
          const SETS: Record<string, Record<string, string>> = {
            one: { 'main.pathogen': 'program' },
            gears: {
              'main.pathogen': 'program',
              'parts/gears.pathogen': 'library',
              'demos/gears.pathogen': 'program',
              'parts/kit.pathogen': 'library',
            },
            json: { 'main.pathogen': 'program', 'parts/gears.pathogen': 'library', 'pathogen.json': 'json' },
            many: Object.fromEntries([
              ['main.pathogen', 'program'],
              ...Array.from({ length: 11 }, (_, i) => [`shapes/star-${i}.pathogen`, i % 3 ? 'program' : 'library']),
            ]),
          };
          const kinds = SETS[String(props.set)] ?? SETS.one;
          let open = Object.keys(kinds);
          const tabs = document.createElement('editor-tabs') as HTMLElement & {
            items: unknown[];
            active: string | null;
            docsOpen: boolean;
          };
          if (props.width) tabs.style.width = `${Number(props.width)}px`;
          tabs.style.border = '1px solid var(--border-color, #ddd)';
          const apply = (): void => {
            tabs.items = tabItems(
              open,
              () => '',
              (path) => kinds[path] === 'library',
            );
          };
          apply();
          tabs.active = String(props.active ?? open[0]);
          tabs.docsOpen = Boolean(props.docsOpen);
          container.appendChild(tabs);

          tabs.addEventListener('tab-select', (e) => {
            tabs.active = (e as CustomEvent<{ path: string }>).detail.path;
          });
          tabs.addEventListener('tab-close', (e) => {
            const next = afterTabClosed(open, tabs.active, (e as CustomEvent<{ path: string }>).detail.path);
            if (!next) return;
            open = next.openFiles;
            apply();
            tabs.active = next.active;
          });
          tabs.addEventListener('toggle-docs', () => {
            tabs.docsOpen = !tabs.docsOpen;
          });
          controls.on('docsOpen', (v) => {
            tabs.docsOpen = Boolean(v);
          });
        })
        .catch((err: unknown) => console.error('Editor Tabs story failed to load:', err));
    },
  },
  {
    id: 'file-tree',
    name: 'File Tree',
    category: 'Editor',
    description:
      "The workspace's files beside the editor (docs/workspace-files.md, mockup v6 screens O, J and N). Folders first, then files, each by name; .pathogen quiet; a module's box icon; the main's badge when it isn't main.pathogen; pathogen.json last, with a lock. Click a folder to fold it, a file to open it. One Tab stop: Up and Down move, Right and Left unfold and fold, Space opens a file, Enter opens it and goes to the editor. The + adds a program, a module or a folder to the folder clicked last, else the folder of the file in the editor, else the top: a name field appears first in that folder; a taken name is refused in place; Enter creates, Esc cancels. Each row's ⋮ (or a right-click, or Shift+F10) opens its menu: Rename… turns the row into a field holding its name, and Move to… lists the top and the folders, the one it's in marked.",
    stories: [
      { name: 'A workspace with folders', props: { set: 'gears', active: 'demos/gears.pathogen' } },
      { name: 'A new workspace', props: { set: 'new', active: 'main.pathogen' } },
      { name: 'Another main, an empty folder', props: { set: 'otherMain', active: 'poster.pathogen' } },
      { name: 'pathogen.json open', props: { set: 'gears', active: 'pathogen.json' } },
      { name: 'Long names', props: { set: 'long', active: 'shapes/a-rather-long-name-for-a-star.pathogen' } },
      { name: 'The + menu', props: { set: 'gears', active: 'parts/gears.pathogen', open: 'menu' } },
      { name: 'A taken name', props: { set: 'gears', active: 'parts/gears.pathogen', open: 'taken' } },
      { name: 'A program’s menu', props: { set: 'gears', active: 'main.pathogen', open: 'row:try-sizes.pathogen' } },
      { name: 'A folder’s menu', props: { set: 'gears', active: 'main.pathogen', open: 'row:parts' } },
      { name: 'Renaming a folder', props: { set: 'gears', active: 'main.pathogen', open: 'rename:parts' } },
      { name: 'Move to…', props: { set: 'gears', active: 'main.pathogen', open: 'move:parts/kit.pathogen' } },
    ],
    controls: [],
    notes:
      'Clicking a file here marks it, and a name accepted in the name field adds the file or folder, as workspace-view does (open-file, create-entry); Rename… and Move to… move the rows (rename-entry, move-entry). Names are checked here the way the workspace checks them: a name taken in the folder, in any letter case, is refused. The lines under Rename…’s field and at the foot of Move to… are workspace-view’s, from the plans: here they are samples, since a story has no imports to count.',
    render: (container, props) => {
      import('../components/file-tree.js')
        .then(() => {
          type Kind = 'program' | 'library';
          const GEARS: [string, Kind][] = [
            ['main.pathogen', 'program'],
            ['try-sizes.pathogen', 'program'],
            ['demos/gears.pathogen', 'program'],
            ['parts/gears.pathogen', 'library'],
            ['parts/kit.pathogen', 'library'],
            ['parts/labels.pathogen', 'library'],
          ];
          const SETS: Record<string, { files: [string, Kind][]; folders: string[]; main: string }> = {
            gears: { files: GEARS, folders: [], main: 'main.pathogen' },
            new: { files: [['main.pathogen', 'program']], folders: [], main: 'main.pathogen' },
            otherMain: {
              files: [...GEARS.filter(([p]) => p !== 'main.pathogen'), ['poster.pathogen', 'program']],
              folders: ['examples'],
              main: 'poster.pathogen',
            },
            long: {
              files: [
                ['main.pathogen', 'program'],
                ['shapes/a-rather-long-name-for-a-star.pathogen', 'program'],
                ['shapes/round/and-another-long-library-name.pathogen', 'library'],
              ],
              folders: [],
              main: 'main.pathogen',
            },
          };
          const set = SETS[String(props.set)] ?? SETS.gears;
          const tree = document.createElement('file-tree');
          tree.style.width = '248px';
          tree.style.height = '380px';
          tree.style.border = '1px solid var(--border-color, #ddd)';
          container.appendChild(tree);
          tree.files = set.files.map(([path, kind]) => ({ path, kind }));
          tree.folders = set.folders;
          tree.main = set.main;
          tree.active = String(props.active ?? set.main);
          const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
          // A name taken in its folder, in any letter case, as the workspace's rules say.
          tree.checkName = (kind, folder, name) => {
            const path = join(folder, kind === 'folder' ? name : `${name}.pathogen`).toLowerCase();
            const taken = [...tree.files.map((f) => f.path), ...tree.folders].some((p) => p.toLowerCase() === path);
            if (!taken) return null;
            const where = folder ? `${folder}/` : 'The top of the workspace';
            const base = path.slice(path.lastIndexOf('/') + 1);
            return `${where} already has ${base}${kind === 'folder' ? '/' : ''}.`;
          };
          tree.addEventListener('open-file', (e) => {
            tree.active = (e as CustomEvent<{ path: string }>).detail.path;
          });
          tree.addEventListener('create-entry', (e) => {
            const { kind, folder, name } = (e as CustomEvent<{ kind: Kind | 'folder'; folder: string; name: string }>)
              .detail;
            if (kind === 'folder') tree.folders = [...tree.folders, join(folder, name)];
            else {
              const path = join(folder, `${name}.pathogen`);
              tree.files = [...tree.files, { path, kind }];
              tree.active = path;
            }
          });
          // Rename… and Move to…: a taken name is refused; the lines are samples (see the notes).
          const isFolder = (path: string): boolean => !tree.files.some((f) => f.path === path);
          const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
          const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
          /** Where Rename… puts `path` named `name` (a file keeps its .pathogen). */
          const renamed = (path: string, name: string): string =>
            join(parentOf(path), isFolder(path) ? name : `${name.replace(/\.pathogen$/i, '')}.pathogen`);
          /** Why `to` can't be used: another file or folder has it, in any letter case. */
          const taken = (to: string, self: string): string | undefined => {
            const all = [...tree.files.map((f) => f.path), ...tree.folders];
            if (!all.some((p) => p.toLowerCase() === to.toLowerCase() && p !== self)) return undefined;
            const folder = parentOf(to);
            return `${folder ? `${folder}/` : 'The top of the workspace'} already has ${baseOf(to)}.`;
          };
          tree.checkRename = (path, name) => {
            const message = taken(renamed(path, name), path);
            if (message) return { message };
            const files = tree.files.filter((f) => f.path.startsWith(`${path}/`)).length;
            const hint = isFolder(path)
              ? `Moves its ${files} files, and updates the imports in 3 files`
              : 'Updates the imports in 2 files';
            return { hint };
          };
          tree.checkMove = (path, folder) => {
            const message = taken(join(folder, baseOf(path)), path);
            const dest = folder ? `${folder}/` : 'the top';
            return message ? { message } : { hint: `Moving it to ${dest} updates the imports in main.pathogen.` };
          };
          const moveRows = (from: string, to: string): void => {
            const follow = (p: string): string =>
              p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p;
            tree.files = tree.files.map((f) => ({ ...f, path: follow(f.path) }));
            tree.folders = tree.folders.map(follow);
            if (tree.active) tree.active = follow(tree.active);
          };
          tree.addEventListener('rename-entry', (e) => {
            const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail;
            moveRows(path, renamed(path, name));
          });
          tree.addEventListener('move-entry', (e) => {
            const { path, folder } = (e as CustomEvent<{ path: string; folder: string }>).detail;
            moveRows(path, join(folder, baseOf(path)));
          });
          // A row's menu here only closes when chosen: workspace-view is what acts on file-action.
          // Two stories open the + menu, one goes on to name a library that's taken, two open a
          // row's menu, one renames a folder and one opens Move to….
          const open = String(props.open ?? '');
          const chooseIn = (path: string, action: string): void => {
            tree.shadowRoot!.querySelector<HTMLElement>(`[data-path="${path}"] .row-menu`)!.click();
            tree.shadowRoot!.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
          };
          if (open.startsWith('row:')) {
            tree.shadowRoot!.querySelector<HTMLElement>(`[data-path="${open.slice(4)}"] .row-menu`)!.click();
          } else if (open.startsWith('rename:')) {
            chooseIn(open.slice(7), 'rename');
            const field = tree.shadowRoot!.querySelector<HTMLInputElement>('.row.input input')!;
            field.value = 'machines';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (open.startsWith('move:')) {
            chooseIn(open.slice(5), 'move');
          } else if (open) {
            const root = tree.shadowRoot!;
            root.querySelector<HTMLButtonElement>('.add')!.click();
            if (open === 'taken') {
              root.querySelector<HTMLElement>('[data-action="new-library"]')!.click();
              const field = root.querySelector<HTMLInputElement>('.row.input input')!;
              field.value = 'gears';
              field.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        })
        .catch((err: unknown) => console.error('File Tree story failed to load:', err));
    },
  },
  {
    id: 'editor-zero-state',
    name: 'Editor Zero-State',
    category: 'Editor',
    description:
      'The editor with no file open (mockup v11, note 57): the workspace\'s one zero-state, holding every "why" and every button. With a main, it opens the main. With no program, it says why nothing draws and offers New program. With Files off, Show files is beside it. The preview has no zero-state of its own.',
    stories: [
      { name: 'With a main', props: { main: 'main.pathogen' } },
      { name: 'The tree hidden', props: { main: 'main.pathogen', filesHidden: true } },
      { name: 'Only modules', props: { main: '', onlyLibraries: true } },
      { name: 'No files', props: { main: '', noFiles: true } },
      { name: 'No program, the tree hidden', props: { main: '', onlyLibraries: true, filesHidden: true } },
    ],
    controls: [],
    notes:
      'workspace-view gives it the main (or none), whether the workspace has files and programs, and whether Files is on, and acts on its zero-state-action events (open-main, new-program, show-files). Here a button does nothing.',
    render: (container, props) => {
      import('../components/editor-zero-state.js')
        .then(() => {
          const zero = document.createElement('editor-zero-state');
          zero.style.display = 'grid';
          zero.style.height = '360px';
          zero.style.border = '1px solid var(--border-color, #ddd)';
          container.appendChild(zero);
          zero.view = {
            main: props.main ? String(props.main) : null,
            noFiles: Boolean(props.noFiles),
            onlyLibraries: Boolean(props.onlyLibraries),
            filesHidden: Boolean(props.filesHidden),
          };
        })
        .catch((err: unknown) => console.error('Editor Zero-State story failed to load:', err));
    },
  },
  {
    id: 'program-chip',
    name: 'Program Chip',
    category: 'Editor',
    description:
      'Beside the zoom controls, the program the preview shows (mockup v6 screen G). Its list opens upward: each program with its miniature, name and path, a check on the one shown, and Open in the editor on hover. It is the one way to change what the preview shows. The dot marks the programs that use the file you are editing; a program redrawing spins; one that failed says where, and lights the chip.',
    stories: [
      { name: 'Closed', props: { set: 'closed' } },
      { name: 'Open', props: { set: 'open' } },
      { name: 'Editing a module', props: { set: 'library' } },
      { name: 'Another program broke', props: { set: 'error' } },
      { name: 'The main is a module', props: { set: 'main-library' } },
      { name: 'Two programs called gears', props: { set: 'same-name' } },
      { name: 'Just opened: the others drawing', props: { set: 'loading' } },
    ],
    controls: [],
    notes:
      'workspace-view gives it the rows (services/program-list.ts, with each program’s drawing from services/program-drawings.ts), the program shown, the file being edited and the red dot, and acts on show-program and open-file. It says program-list-open when its list opens, which is when the miniatures are drawn. The miniatures here are stand-ins; in the playground each is the program’s own drawing on the canvas colour. Here a row only moves the check.',
    render: (container, props) => {
      Promise.all([import('../components/program-chip.js'), import('../services/program-list.js')])
        .then(([, { chipAlert, MODULE_MAIN }]) => {
          type Row = ProgramItem;
          // Stand-in miniatures: circles, as the gears draw at that size.
          const art = (circles: [number, number, number][]): string =>
            `data:image/svg+xml,${encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g fill="none" stroke="#1c1722" stroke-width="4">${circles
                .map(
                  ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y}" r="${r * 0.3}"/>`,
                )
                .join('')}</g></svg>`,
            )}`;
          const row = (path: string, extra: Partial<Row> = {}): Row => ({
            path,
            name: path.slice(path.lastIndexOf('/') + 1).replace(/\.pathogen$/, ''),
            hint: null,
            badge: false,
            error: null,
            uses: null,
            updating: false,
            miniature: null,
            ...extra,
          });
          const MAIN = art([
            [55, 50, 40],
            [150, 50, 28],
          ]);
          const GEARS = art([
            [40, 50, 22],
            [100, 50, 22],
            [160, 50, 22],
          ]);
          const TRY = art([
            [60, 50, 12],
            [140, 50, 30],
          ]);
          const set = String(props.set ?? 'closed');
          let items: Row[] = [
            row('main.pathogen', { miniature: MAIN }),
            row('demos/gears.pathogen', { miniature: GEARS }),
            row('try-sizes.pathogen', { miniature: TRY }),
          ];
          let shown = 'main.pathogen';
          let editing: string | null = 'main.pathogen';
          if (set === 'library') {
            editing = 'parts/gears.pathogen';
            items = items.map((r) => ({ ...r, uses: 'import', updating: r.path !== shown }));
          } else if (set === 'error') {
            items = items.map((r) =>
              r.path === 'try-sizes.pathogen' ? { ...r, error: 'Error in parts/gears.pathogen line 9' } : r,
            );
          } else if (set === 'main-library') {
            items = items.map((r) => (r.path === 'main.pathogen' ? { ...r, error: MODULE_MAIN, uses: 'self' } : r));
          } else if (set === 'same-name') {
            items = [
              row('try-sizes.pathogen', { miniature: TRY, badge: true }),
              row('demos/gears.pathogen', { miniature: GEARS, hint: 'demos' }),
              row('parts/gears.pathogen', { miniature: MAIN, hint: 'parts' }),
            ];
            shown = 'parts/gears.pathogen';
          } else if (set === 'loading') {
            // Just after a load: the program shown has drawn; the others spin on blank tiles until theirs compile.
            items = items.map((r) => (r.path === shown ? r : { ...r, miniature: null, updating: true }));
          }
          // A preview's lower part: the chip sits centred at the bottom, its list opening upward.
          const stage = document.createElement('div');
          stage.style.cssText =
            'position:relative;height:440px;overflow:hidden;border:1px solid var(--border-color, #ddd);border-radius:8px;background:var(--bg-primary, #f8f9fa);';
          const bar = document.createElement('div');
          bar.style.cssText = 'position:absolute;bottom:12px;left:0;right:0;display:flex;justify-content:center;';
          const chip = document.createElement('program-chip');
          bar.appendChild(chip);
          stage.appendChild(bar);
          container.appendChild(stage);
          const draw = (): void => {
            chip.items = items;
            chip.shown = shown;
            chip.editing = editing;
            chip.alert = chipAlert(items, shown);
          };
          draw();
          chip.addEventListener('show-program', (e) => {
            shown = (e as CustomEvent<{ path: string }>).detail.path;
            draw();
          });
          // Opened as a mouse would (a click with no pointer counts as the keyboard's).
          if (set !== 'closed') {
            chip
              .shadowRoot!.querySelector('.pick')!
              .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          }
        })
        .catch((err: unknown) => console.error('Program Chip story failed to load:', err));
    },
  },
  {
    id: 'confirm-dialog',
    name: 'Confirm Dialog',
    category: 'Editor',
    description:
      'What Delete… asks before it deletes (mockup v7 screen F): what goes, as a list, and what follows, in a box. Cancel has the first focus, so a stray Enter never confirms; Escape, × and Cancel all say no. In the playground it is modal (confirmDialog); here it is shown in place.',
    stories: [
      { name: 'Deleting a folder', props: { set: 'folder' } },
      { name: 'Deleting a file others import', props: { set: 'file' } },
      { name: 'Deleting an empty folder', props: { set: 'empty' } },
    ],
    controls: [],
    notes: 'Answering shows the answer; Ask again brings the question back.',
    render: (container, props) => {
      Promise.all([import('../components/shared/confirm-dialog.js'), import('./delete-question.js')])
        .then(([, { deleteQuestion }]) => {
          const QUESTIONS = {
            folder: deleteQuestion('parts', true, {
              files: ['parts/gears.pathogen', 'parts/kit.pathogen', 'parts/labels.pathogen'],
              importers: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'],
            }),
            file: deleteQuestion('parts/kit.pathogen', false, {
              files: ['parts/kit.pathogen'],
              importers: ['main.pathogen'],
            }),
            empty: deleteQuestion('examples', true, { files: [], importers: [] }),
          };
          const question = QUESTIONS[String(props.set) as keyof typeof QUESTIONS] ?? QUESTIONS.folder;
          const ask = (): void => {
            container.innerHTML = '';
            const dialog = document.createElement('confirm-dialog');
            container.appendChild(dialog);
            dialog
              .ask(question, { modal: false })
              .then((yes) => {
                const said = document.createElement('p');
                said.textContent = `Answered: ${yes ? question.confirmLabel : 'no'}. `;
                const again = document.createElement('button');
                again.type = 'button';
                again.textContent = 'Ask again';
                again.addEventListener('click', ask);
                said.append(again);
                container.appendChild(said);
              })
              .catch((err: unknown) => console.error(err));
          };
          ask();
        })
        .catch((err: unknown) => console.error('Confirm Dialog story failed to load:', err));
    },
  },
  {
    id: 'clash-prompt',
    name: 'Clash Prompt',
    category: 'Editor',
    description:
      'What an upload asks when a name is taken (mockup v6 screen U, state 2): Replace, Keep both (the new one numbered) or Skip, and, with more taken names, "Do the same for the others". The keyboard starts on Keep both, which loses nothing; Escape skips. In the playground the file tree places it beside the row of the file already there.',
    stories: [
      { name: 'One taken name', props: { others: 0 } },
      { name: 'Three taken names', props: { others: 2 } },
    ],
    controls: [],
    notes: 'Answering shows the answer; Ask again brings the question back.',
    render: (container, props) => {
      import('../components/clash-prompt.js')
        .then(() => {
          const ask = (): void => {
            container.innerHTML = '';
            // In place for the story: the playground fixes it beside a row of the tree.
            const stage = document.createElement('div');
            stage.style.cssText = 'position:relative;height:150px;';
            const prompt = document.createElement('clash-prompt');
            prompt.style.cssText = 'position:absolute;left:12px;top:8px;';
            stage.appendChild(prompt);
            container.appendChild(stage);
            prompt
              .ask({
                name: 'labels.pathogen',
                where: 'parts/',
                keepBothName: 'labels-2.pathogen',
                others: Number(props.others ?? 0),
              })
              .then((answer) => {
                const said = document.createElement('p');
                said.textContent = `Answered: ${answer ? `${answer.choice}${answer.forAll ? ', for all' : ''}` : 'withdrawn'}. `;
                const again = document.createElement('button');
                again.type = 'button';
                again.textContent = 'Ask again';
                again.addEventListener('click', ask);
                said.append(again);
                container.appendChild(said);
              })
              .catch((err: unknown) => console.error(err));
          };
          ask();
        })
        .catch((err: unknown) => console.error('Clash Prompt story failed to load:', err));
    },
  },
  {
    id: 'svg-preview-pane',
    name: 'SVG Preview',
    category: 'Editor',
    description:
      'SVG preview with zoom/pan controls. No card and no minimap: the fullscreen button sits top-left, and Fit leaves a margin around the drawing.',
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
      {
        // compilationStatus: 'error' also lights the fullscreen status chip —
        // enter fullscreen to see it drop below the stale badge (the
        // #preview-container.stale ~ #compilation-status overlap case).
        name: 'Stale (compile error)',
        props: {
          pathData: 'M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100',
          stale: true,
          compilationStatus: 'error',
        },
      },
      {
        // Enter fullscreen (the expand button, top left) to see the
        // export + refresh chrome; refresh appears because usesRandom seeds
        // calledStdlibFunctions with 'randomRange'.
        name: 'Random program (fullscreen chrome)',
        props: { pathData: 'M 100 10 L 40 198 L 190 78 L 10 78 L 160 198 Z', usesRandom: true },
      },
      {
        // The compiling chip carries an elapsed clock ("Compiling... MM:SS").
        // Enter fullscreen to see it top-center; 754000 ms renders as 12:34.
        name: 'Compiling (long, fullscreen chip)',
        props: {
          pathData: 'M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100',
          compilationStatus: 'compiling',
          compilationElapsedMs: 754_000,
        },
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
      { name: 'stale', type: 'boolean', label: 'Stale (compile error)', default: false },
      { name: 'usesRandom', type: 'boolean', label: 'Uses random (fullscreen refresh)', default: false },
    ],
    render: (container, props, controls) => {
      // Need to import store for svg-preview-pane
      import('../state/store.js').then(({ store }) => {
        store.update({
          width: (props.width as number) || 200,
          height: (props.height as number) || 200,
          pathData: (props.pathData as string) || '',
          calledStdlibFunctions: props.usesRandom ? ['randomRange'] : [],
          compilationStatus: (props.compilationStatus as string) || 'idle',
          compilationElapsedMs: (props.compilationElapsedMs as number) || 0,
        });

        const preview = document.createElement('svg-preview-pane');
        preview.style.height = '350px';
        preview.style.width = '100%';
        preview.style.border = '1px solid var(--border-color, #ddd)';
        container.appendChild(preview);

        // Give time for component to initialize
        setTimeout(() => {
          (preview as unknown as { pathData: string }).pathData = (props.pathData as string) || '';
          if (props.stale) (preview as unknown as { setStale: (s: boolean) => void }).setStale(true);
        }, 100);

        controls.on('pathData', (value) => {
          (preview as unknown as { pathData: unknown }).pathData = value;
        });
        controls.on('stale', (value) => {
          (preview as unknown as { setStale: (s: boolean) => void }).setStale(Boolean(value));
        });
        controls.on('width', (value) => {
          store.set('width', value);
        });
        controls.on('height', (value) => {
          store.set('height', value);
        });
        controls.on('usesRandom', (value) => {
          store.set('calledStdlibFunctions', value ? ['randomRange'] : []);
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

        const panel = document.createElement('layers-panel') as HTMLElement & { layers: unknown[] };
        // Override auto-hide for storybook display
        panel.style.display = 'block';
        panel.style.position = 'relative';
        container.appendChild(panel);
        // Panels are prop-driven (they do not subscribe to the store)
        panel.layers = (props.layers ?? []) as unknown[];
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

        const panel = document.createElement('palette-panel') as HTMLElement & { layers: unknown[] };
        panel.style.display = 'block';
        panel.style.position = 'relative';
        container.appendChild(panel);
        // Panels are prop-driven (they do not subscribe to the store)
        panel.layers = (props.layers ?? []) as unknown[];
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
        // Warning mirrors that differ only in numbers collapse into one row
        // with a ×N chip (through window.PathogenLang.groupWarnLogEntries).
        name: 'Repeated warnings',
        props: {
          isOpen: true,
          logs: [
            {
              line: 7,
              severity: 'warn',
              parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 2: effective radius 10.00' }],
            },
            {
              line: 7,
              severity: 'warn',
              parts: [{ type: 'string', value: '[warn] Fillet skipped at vertex 2: radius too large for edge length' }],
            },
            { line: 9, parts: [{ type: 'string', value: 'drawing plate' }] },
            {
              line: 7,
              severity: 'warn',
              parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 0: effective radius 6.53' }],
            },
            {
              line: 7,
              severity: 'warn',
              parts: [{ type: 'string', value: '[warn] Fillet skipped at vertex 0: radius too large for edge length' }],
            },
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
        (consolePane as unknown as { open: () => void }).open();
      }
      (consolePane as unknown as { logs: unknown }).logs = props.logs || [];

      controls.on('isOpen', (value) => {
        if (value) {
          (consolePane as unknown as { open: () => void }).open();
        } else {
          (consolePane as unknown as { close: () => void }).close();
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
    id: 'playground-header',
    name: 'Playground Header',
    category: 'Editor',
    description: 'Editor header with file controls, pane toggles, and examples dropdown',
    stories: [
      {
        name: 'Default',
        props: { fileName: null, isModified: false, consoleOpen: false },
      },
      {
        name: 'With File',
        props: { fileName: 'my-drawing.svg', isModified: false, consoleOpen: false },
      },
      {
        name: 'Modified',
        props: { fileName: 'my-drawing.svg', isModified: true, consoleOpen: false },
      },
      {
        name: 'Panes Open',
        props: { fileName: null, isModified: false, consoleOpen: true },
      },
      {
        // The compiling chip carries an elapsed clock; 754000 ms renders as 12:34.
        name: 'Compiling (long)',
        props: {
          fileName: 'slow-drawing.svg',
          isModified: false,
          consoleOpen: false,
          compilationStatus: 'compiling',
          compilationElapsedMs: 754_000,
        },
      },
    ],
    controls: [
      { name: 'fileName', type: 'text', label: 'File Name', default: '' },
      { name: 'isModified', type: 'toggle', label: 'Modified', default: false },
      { name: 'consoleOpen', type: 'toggle', label: 'Console Open', default: false },
    ],
    render: (container, props, controls) => {
      import('../state/store.js').then(({ store }) => {
        // Set initial store state
        (store as any).update({
          currentFileName: (props.fileName as string) || null,
          isModified: (props.isModified as boolean) || false,
          consoleOpen: (props.consoleOpen as boolean) || false,
          compilationStatus: (props.compilationStatus as string) || 'idle',
          compilationElapsedMs: (props.compilationElapsedMs as number) || 0,
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
        controls.on('consoleOpen', (value) => {
          store.set('consoleOpen', value);
        });
      });
    },
  },
  {
    id: 'canvas-panel',
    name: 'Canvas Section',
    category: 'Editor',
    description:
      "The inspector's Canvas section: the preview's Background, Grid and Precision (they were the footer's). It shows the values it is given and reports each change as a canvas-change event; workspace-view writes the store and saves them with the workspace.",
    stories: [
      { name: 'A new workspace', props: { set: 'defaults' } },
      { name: 'Grid off, precision 2', props: { set: 'rounded' } },
      { name: 'A long background color', props: { set: 'long' } },
      { name: 'In the inspector, above Layers', props: { set: 'defaults', inspector: true } },
    ],
    controls: [],
    notes: 'Changing a control here updates the story, as workspace-view does (canvas-change).',
    render: (container, props) => {
      const loaded = Promise.all([import('../components/canvas-panel.js'), import('../components/inspector-panel.js')]);
      loaded
        .then(() => {
          type Settings = CanvasSettings;
          const SETS: Record<string, Settings> = {
            defaults: { background: '#f5f5f5', gridEnabled: true, gridColor: '#cccccc', gridSize: 20, toFixed: null },
            rounded: { background: '#ffffff', gridEnabled: false, gridColor: '#cccccc', gridSize: 50, toFixed: 2 },
            long: {
              background: 'oklch(92.4% 14.2% 84.6 / 0.85)',
              gridEnabled: true,
              gridColor: '#b8b0c4',
              gridSize: 10,
              toFixed: null,
            },
          };
          let settings = SETS[String(props.set)] ?? SETS.defaults;
          const frame = document.createElement('div');
          frame.style.width = '240px';
          frame.style.border = '1px solid var(--border-color, #ddd)';
          frame.style.background = 'var(--bg-elevated, #fff)';
          container.appendChild(frame);

          let show: (s: Settings) => void;
          if (props.inspector) {
            frame.style.height = '300px';
            const inspector = document.createElement('inspector-panel') as HTMLElement & {
              canvasSettings: Settings;
              setData: (data: Record<string, unknown>) => void;
            };
            inspector.setAttribute('canvas', '');
            frame.appendChild(inspector);
            inspector.setData({
              layers: [
                { name: 'main-path-layer', type: 'path', data: 'M 0 0', styles: { stroke: '#222' }, isDefault: true },
              ],
              masks: [],
              clipPaths: [],
              gradients: [],
              cssProperties: [],
              layerVisibility: {},
              defsVisibility: {},
            });
            show = (s) => {
              inspector.canvasSettings = s;
            };
          } else {
            const panel = document.createElement('canvas-panel') as HTMLElement & { settings: Settings };
            panel.setAttribute('embedded', '');
            frame.appendChild(panel);
            show = (s) => {
              panel.settings = s;
            };
          }
          show(settings);
          frame.addEventListener('canvas-change', (e) => {
            const { setting, value } = (e as CustomEvent<{ setting: keyof Settings; value: unknown }>).detail;
            settings = { ...settings, [setting]: value };
            show(settings);
          });
        })
        .catch((err: unknown) => console.error('Canvas Section story failed to load:', err));
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
        setTimeout(() => (panel as unknown as { open: () => void }).open(), 50);
      }

      controls.on('isOpen', (value) => {
        if (value) (panel as unknown as { open: () => void }).open();
        else (panel as unknown as { close: () => void }).close();
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
    description:
      'Breadcrumb navigation trail showing current location; in workspace view the title is followed by the estimated Export → SVG size',
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
        'Note: Shows breadcrumb for current storybook view. Navigation links are disabled in this demo. ' +
        'The export-size indicator after the title only renders in workspace view, so it is not visible here.';
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
      {
        // A family of warning mirrors: the first instance with a ×N chip that
        // expands to the individual instances.
        name: 'Warning Group',
        props: {
          data: {
            line: 7,
            severity: 'warn',
            parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 2: effective radius 10.00' }],
          },
          group: {
            count: 3,
            instances: [
              {
                line: 7,
                severity: 'warn',
                parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 2: effective radius 10.00' }],
              },
              {
                line: 7,
                severity: 'warn',
                parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 1: effective radius 8.25' }],
              },
              {
                line: 7,
                severity: 'warn',
                parts: [{ type: 'string', value: '[warn] Fillet radius clamped at vertex 0: effective radius 6.53' }],
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

      const entry = document.createElement('log-entry') as HTMLElement & { data: unknown; group: unknown };
      entry.data = props.data;
      if (props.group) entry.group = props.group;
      container.appendChild(entry);
    },
  },
  {
    id: 'app-toast',
    name: 'Toast',
    category: 'Shared',
    description: 'Global toast notifications (success / error) with optional thumbnail preview',
    stories: [
      {
        name: 'Success with thumbnail',
        props: {
          type: 'success',
          title: 'Thumbnail set',
          message: 'Your new thumbnail will appear on your workspaces page.',
          image:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="%2310b981"/><circle cx="24" cy="24" r="14" fill="white" opacity="0.85"/></svg>',
        },
      },
      {
        name: 'Plain success',
        props: { type: 'success', title: 'Saved', message: 'Your changes have been saved.' },
      },
      {
        name: 'Error',
        props: { type: 'error', title: 'Save failed', message: 'Network request returned 500.' },
      },
      {
        // An upload's toast (2d, step 6a; mockup v6 screen U, state 4): what went in, then what didn't and why.
        name: 'With a list (an upload)',
        props: {
          type: 'success',
          title: 'Added springs.pathogen.',
          message: 'Not added:',
          items: [
            'cities.csv: workspaces hold .pathogen files for now; data files come later.',
            'Raleway-Bold.ttf: the playground can\'t load font files yet. Use the Google Fonts family instead: @font "Raleway" 700;',
          ],
          action: 'Undo',
        },
      },
    ],
    controls: [
      { name: 'title', type: 'text', label: 'Title', default: 'Thumbnail set' },
      {
        name: 'message',
        type: 'text',
        label: 'Message',
        default: 'Your new thumbnail will appear on your workspaces page.',
      },
    ],
    render: (container, props, controls) => {
      const toast = document.createElement('app-toast') as HTMLElement & {
        show: (opts: Record<string, unknown>) => void;
      };
      container.appendChild(toast);

      const show = (): void => {
        toast.show({
          type: (props.type as string) || 'success',
          title: (props.title as string) || 'Thumbnail set',
          message: props.message as string | undefined,
          image: props.image as string | undefined,
          items: props.items,
          action: props.action ? { label: props.action as string, onSelect: () => undefined } : undefined,
          duration: 0,
        });
      };

      // Trigger once on initial render and on control changes.
      queueMicrotask(show);
      controls.on('title', (value) => {
        props.title = value;
        show();
      });
      controls.on('message', (value) => {
        props.message = value;
        show();
      });
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
  {
    id: 'pathogen-zoom-pill',
    name: 'Zoom Pill',
    category: 'Shared',
    description:
      'THE shared zoom control for every preview surface (workspace, export/thumbnail modals, mini-workspace, VS Code). Glass pill with −/Fit/+ and an editable percentage. Registered by the pan-zoom bundle (src/ui/zoom-pill.ts), not a playground module.',
    stories: [
      { name: 'Hover Fade (default)', props: {} },
      { name: 'Always Visible', props: { alwaysVisible: true } },
    ],
    controls: [],
    render: (container, props) => {
      // Positioned stage so the pill's absolute bottom-center placement and
      // hover-fade read exactly as they do over a live preview.
      const stage = document.createElement('div');
      stage.style.cssText =
        'position:relative; height:220px; border:1px dashed var(--border-color, #e2e8f0); border-radius:12px; ' +
        'background:repeating-conic-gradient(var(--bg-primary, #f8f9fa) 0 25%, var(--bg-secondary, #fff) 0 50%) 0 0 / 24px 24px;';

      const pill = document.createElement('pathogen-zoom-pill');
      if (props.alwaysVisible) pill.setAttribute('always-visible', '');

      // Stub controller: maintains a zoom value and pushes it back to the
      // pill, mimicking a surface's onChange loop.
      let zoom = 1;
      const clamp = (z: number): number => Math.min(20, Math.max(0.1, z));
      const push = (): void => {
        pill.zoom = zoom;
      };
      pill.controller = {
        zoomIn: () => {
          zoom = clamp(zoom * 1.5);
          push();
        },
        zoomOut: () => {
          zoom = clamp(zoom / 1.5);
          push();
        },
        zoomToFit: () => {
          zoom = 1;
          push();
        },
        zoomTo: (z: number) => {
          zoom = clamp(z);
          push();
        },
        getView: () => ({ zoom }),
      };
      pill.fadeTarget = stage;

      stage.appendChild(pill);
      container.appendChild(stage);
    },
  },
  {
    id: 'edit-workspace-metadata-modal',
    name: 'Edit Workspace Metadata Modal',
    category: 'Shared',
    description:
      'Centered card dialog for renaming a workspace and editing its description. Triggered from the breadcrumb overflow menu via the "Rename workspace" item.',
    stories: [
      {
        name: 'Default',
        props: { name: 'My Spirograph', description: 'A nested rotation pattern with adjustable arms.' },
      },
      {
        name: 'Empty fields',
        props: { name: '', description: '' },
      },
      {
        name: 'Long description',
        props: {
          name: 'Layered Marker Demo',
          description:
            'Explores stacked path markers and the interaction between context-stroke, context-fill, and inherited dash patterns across multiple layers.',
        },
      },
    ],
    controls: [
      { name: 'name', type: 'text', label: 'Name', default: 'My Spirograph' },
      {
        name: 'description',
        type: 'text',
        label: 'Description',
        default: 'A nested rotation pattern with adjustable arms.',
      },
    ],
    notes:
      'In storybook the modal is rendered open. In the playground it is hidden by default and shown when the user invokes "Rename workspace" from the overflow menu.',
    render: (container, props, controls) => {
      void import('../components/edit-workspace-metadata-modal.js');

      const modal = document.createElement('edit-workspace-metadata-modal') as HTMLElement & {
        open: (opts: { name: string | null; description: string | null }) => void;
      };
      container.appendChild(modal);

      const reopen = (): void => {
        modal.open({
          name: (props.name as string | null) ?? '',
          description: (props.description as string | null) ?? '',
        });
      };

      queueMicrotask(reopen);
      controls.on('name', (value) => {
        props.name = value;
        reopen();
      });
      controls.on('description', (value) => {
        props.description = value;
        reopen();
      });
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
          caption:
            'Click a color chip in the control bar to recolor the SVG — exercises <pathogen-color-input> in the blog embed.',
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
let bg = PathLayer('bg') #{ fill: var(--bg-color, #f1faee); stroke: none; };
bg.apply { rect(0, 0, 200, 200); }

let ring = PathLayer('ring') #{ stroke: var(--ring-color, #e63946); stroke-width: 6; fill: none; };
ring.apply { circle(100, 100, 60); }

let dot = PathLayer('dot') #{ fill: var(--dot-color, #1d3557); stroke: none; };
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
      const escapedCode = sampleCode.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' })[c] as string);
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
  {
    id: 'account-menu',
    name: 'Account Menu',
    category: 'Auth',
    description: 'Header chip — "Sign in" pill when signed out, name+initial chip with dropdown when signed in.',
    notes:
      'Subscribes to store.currentUser. Set the "Signed in" story to populate a fake user; the real component reads the live store, so changes here only affect the storybook preview.',
    stories: [
      { name: 'Signed out', props: { signedIn: false } },
      { name: 'Signed in', props: { signedIn: true, displayName: 'Ryan K', handle: 'ryan-k' } },
      {
        name: 'Long display name',
        props: { signedIn: true, displayName: 'Ada Augusta Lovelace', handle: 'ada-lovelace' },
      },
    ],
    controls: [
      { name: 'signedIn', type: 'toggle', label: 'Signed in', default: true },
      { name: 'displayName', type: 'text', label: 'Display name', default: 'Ryan K' },
      { name: 'handle', type: 'text', label: 'Handle', default: 'ryan-k' },
    ],
    render: (container, props, controls) => {
      // Lazy import: only load the store + element when this story is opened.
      void import('../state/store.js').then(({ store }) => {
        void import('../components/shared/account-menu.js').then(() => {
          const apply = (p: Record<string, unknown>): void => {
            if (p.signedIn) {
              store.set('currentUser', {
                id: 'storybook-user',
                email: 'demo@example.test',
                handle: (p.handle as string) || 'ryan-k',
                displayName: (p.displayName as string) || 'Ryan K',
              });
            } else {
              store.set('currentUser', null);
            }
          };
          apply(props);
          const menu = document.createElement('account-menu');
          container.appendChild(menu);
          controls.on('signedIn', (v) => apply({ ...props, signedIn: Boolean(v) }));
          controls.on('displayName', (v) => apply({ ...props, displayName: v as string }));
          controls.on('handle', (v) => apply({ ...props, handle: v as string }));
        });
      });
    },
  },
  {
    id: 'auth-modal',
    name: 'Auth Modal',
    category: 'Auth',
    description: 'Two-step passwordless sign-in modal: email + display name, then a 6-digit code grid.',
    notes:
      'Visibility is driven by store.authModalOpen. The "Open" story sets that key to true; close it via the X or Escape. The 6-digit grid is paste-aware and auto-advances.',
    stories: [
      { name: 'Closed', props: { open: false } },
      { name: 'Open', props: { open: true } },
    ],
    controls: [{ name: 'open', type: 'toggle', label: 'Open', default: true }],
    render: (container, props, controls) => {
      void import('../state/store.js').then(({ store }) => {
        void import('../components/shared/auth-modal.js').then(() => {
          const modal = document.createElement('auth-modal');
          container.appendChild(modal);
          store.set('authModalOpen', Boolean(props.open));
          controls.on('open', (v) => store.set('authModalOpen', Boolean(v)));
        });
      });
    },
  },
  {
    id: 'claim-workspaces-prompt',
    name: 'Claim Workspaces Prompt',
    category: 'Auth',
    description: 'Post-verify dialog asking the user whether to claim anonymous workspaces created on the device.',
    notes:
      'Visibility is driven by store.pendingClaimCount + pendingClaimAnonymousId. The "Open" story sets fake values to render the prompt without a real claim flow.',
    stories: [
      { name: 'Closed', props: { open: false, count: 0 } },
      { name: 'One workspace', props: { open: true, count: 1 } },
      { name: 'Many workspaces', props: { open: true, count: 7 } },
    ],
    controls: [
      { name: 'open', type: 'toggle', label: 'Open', default: true },
      { name: 'count', type: 'number', label: 'Count', default: 3, min: 0, max: 99 },
    ],
    render: (container, props, controls) => {
      void import('../state/store.js').then(({ store }) => {
        void import('../components/shared/claim-workspaces-prompt.js').then(() => {
          const apply = (p: Record<string, unknown>): void => {
            store.update({
              pendingClaimAnonymousId: p.open ? 'fake-anon-id-storybook' : null,
              pendingClaimCount: p.open ? Number(p.count) || 0 : 0,
            });
          };
          apply(props);
          const prompt = document.createElement('claim-workspaces-prompt');
          container.appendChild(prompt);
          controls.on('open', (v) => apply({ ...props, open: Boolean(v) }));
          controls.on('count', (v) => apply({ ...props, count: Number(v) }));
        });
      });
    },
  },
  // === Snapshots (docs/snapshots.md) ===
  {
    id: 'snapshot-popover',
    name: 'Snapshot Popover',
    category: 'Snapshots',
    description:
      'Capture panel opened by the Snapshot button: name + note, saving, saved, and every error state. Fixed-position; the owner anchors it to the button.',
    notes:
      'Controlled: the owner calls openAt(rect, placement) then setState(...). Events: snapshot-popover-save/retry/undo/view/sign-in/download-svg/open-export/close. Enter saves from the name; in the note Enter adds a line and Cmd/Ctrl+Enter saves; Esc closes. The Saved state closes itself after 4 s unless hovered.',
    stories: [
      { name: 'Naming', props: { kind: 'naming', placement: 'below' } },
      { name: 'Edited since render', props: { kind: 'naming', staleLine: 5, placement: 'below' } },
      { name: 'Saving', props: { kind: 'saving', placement: 'below' } },
      { name: 'Saved', props: { kind: 'saved', placement: 'below' } },
      { name: 'Signed out', props: { kind: 'signed-out', placement: 'below' } },
      { name: 'Scratch buffer', props: { kind: 'scratch', placement: 'below' } },
      { name: 'Upload failed', props: { kind: 'error-retry', placement: 'below' } },
      { name: 'Quota reached', props: { kind: 'error-quota', placement: 'below' } },
      { name: 'Too large', props: { kind: 'error-large', placement: 'below' } },
      { name: 'Fullscreen (left of button)', props: { kind: 'naming', placement: 'left' } },
    ],
    // Each story is one state; there are no live controls.
    controls: [],
    render: (container, props) => {
      void import('../components/shared/snapshot-popover.js').then(() => {
        const thumb = STORY_ART(7);
        container.style.minHeight = '320px';
        const anchor = document.createElement('button');
        anchor.textContent = 'Snapshot';
        anchor.style.cssText = 'margin: 8px 0 0 380px; padding: 4px 10px; font-size: 12px;';
        container.appendChild(anchor);
        const pop = document.createElement('snapshot-popover') as HTMLElement & {
          openAt: (r: DOMRect, p: string, el?: Element) => void;
          setState: (s: Record<string, unknown>) => void;
        };
        container.appendChild(pop);
        const kind = String(props.kind);
        const base = { thumbUrl: thumb, name: 'Scatter Rings #13' };
        const state: Record<string, unknown> =
          kind === 'naming'
            ? { ...base, kind, staleLine: props.staleLine ?? null }
            : kind === 'saving'
              ? { ...base, kind, sizeLabel: '2.1 MB' }
              : kind === 'saved'
                ? { ...base, kind, total: 13 }
                : kind === 'signed-out'
                  ? { kind, thumbUrl: thumb }
                  : kind === 'scratch'
                    ? { kind, thumbUrl: thumb, workspaceName: 'Untitled 14' }
                    : kind === 'error-retry'
                      ? {
                          ...base,
                          kind: 'error',
                          note: 'keep this one',
                          retry: true,
                          message: "Couldn't reach the server. Your snapshot is held here.",
                        }
                      : kind === 'error-quota'
                        ? {
                            ...base,
                            kind: 'error',
                            note: '',
                            message: "You've used all 500 snapshots. Delete some to make room.",
                          }
                        : {
                            ...base,
                            kind: 'error',
                            note: '',
                            exportInstead: true,
                            message:
                              'This render is 61.2 MB. Snapshots are limited to 50 MB. Try a lower Precision, or export it directly.',
                          };
        // After layout, so the anchor rect is real.
        setTimeout(() => {
          pop.openAt(anchor.getBoundingClientRect(), String(props.placement || 'below'), anchor);
          pop.setState(state);
        }, 50);
        // Stories reopen instead of closing so the state stays inspectable.
        pop.addEventListener('snapshot-popover-close', () => pop.setState(state));
      });
    },
  },
  {
    id: 'snapshot-tray',
    name: 'Snapshot Tray',
    category: 'Snapshots',
    description:
      'Fullscreen-preview tray of this visit’s snapshots, newest first, with “All n →” to the snapshots page.',
    stories: [
      { name: 'One snapshot', props: { count: 1 } },
      { name: 'Five + more', props: { count: 7 } },
      { name: 'Empty (hidden)', props: { count: 0 } },
    ],
    controls: [{ name: 'count', type: 'number', label: 'Snapshots taken', default: 3, min: 0, max: 12 }],
    render: (container, props, controls) => {
      void import('../components/shared/snapshot-tray.js').then(() => {
        const tray = document.createElement('snapshot-tray') as HTMLElement & {
          items: { id: string; n: number; cardUrl: string }[];
          total: number | null;
        };
        container.appendChild(tray);
        const apply = (count: number): void => {
          tray.items = Array.from({ length: count }, (_, i) => ({
            id: `s${i}`,
            n: 12 + count - i,
            cardUrl: STORY_ART(3 + i * 7),
          }));
          tray.total = count ? count + 12 : null;
        };
        apply(Number(props.count));
        controls.on('count', (v) => apply(Number(v)));
      });
    },
  },
  {
    id: 'snapshot-filmstrip',
    name: 'Snapshot Filmstrip',
    category: 'Snapshots',
    description:
      'Row of snapshot frames grouped by day, with sort (Newest / Oldest / With notes). Click selects; ←/→ is handled by the page.',
    stories: [
      { name: 'Twelve snapshots', props: { count: 12 } },
      { name: 'Single', props: { count: 1 } },
      { name: 'Cards still loading', props: { count: 6, pending: true } },
    ],
    controls: [{ name: 'count', type: 'number', label: 'Snapshots', default: 12, min: 0, max: 40 }],
    render: (container, props, controls) => {
      void import('../components/shared/snapshot-filmstrip.js').then(() => {
        const strip = document.createElement('snapshot-filmstrip') as HTMLElement & {
          snapshots: { id: string; n: number; note: string; createdAt: string }[];
          cardUrls: Map<string, string>;
          currentId: string | null;
        };
        container.appendChild(strip);
        const apply = (count: number): void => {
          const now = Date.now();
          const list = Array.from({ length: count }, (_, i) => ({
            id: `s${i}`,
            n: count - i,
            note: i % 4 === 1 ? 'keep this one' : '',
            createdAt: new Date(now - i * 3 * 3_600_000).toISOString(),
          }));
          strip.snapshots = list;
          strip.cardUrls = props.pending ? new Map() : new Map(list.map((s, i) => [s.id, STORY_ART(i * 5 + 2)]));
          strip.currentId = list[1]?.id ?? list[0]?.id ?? null;
        };
        apply(Number(props.count));
        strip.addEventListener('snapshot-select', (e) => {
          strip.currentId = (e as CustomEvent<{ id: string }>).detail.id;
        });
        controls.on('count', (v) => apply(Number(v)));
      });
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
