// The modules mockups as review pages in the BBWP gallery (website/bbwp/, served at
// localhost:3001/website/bbwp/index.html). One self-contained page per mockup set, every
// state in light and dark with a theme toggle, as the 2e-5d page was made. Each set has a
// fixed timestamp (when it was first committed), so running this again replaces its page
// rather than adding another.
//
//   npx tsx project-docs/modules/mockups-bbwp.ts
//   npx tsx scripts/update-bbwp-index.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Figure {
  /** The PNGs are `<base>-light.png` and `<base>-dark.png`. */
  base: string;
  caption: string;
  note: string;
  /** A phone-width shot: shown narrower. */
  phone?: boolean;
}

interface MockupSet {
  dir: string;
  stamp: string;
  slug: string;
  title: string;
  lede: string;
  figures: Figure[];
  /** Extra HTML after the figures, such as the questions for the owner. */
  after?: string;
}

const MODULES = join(process.cwd(), 'project-docs', 'modules');

const SETS: MockupSet[] = [
  {
    dir: 'mockups-2f-vscode-chip',
    stamp: '2026-11-21-15:34:29',
    slug: '2f-vscode-program-chip',
    title: '2f: the program chip in VS Code’s preview',
    lede: 'Phase 2f, mockup v1 (note 66; approved). The playground’s program chip in VS Code’s preview, in a VS Code window drawn by hand, in Dark Modern and Light Modern. The interactive page is <code>project-docs/modules/mockups-2f-vscode-chip/vscode-chip-mockup.html</code>.',
    figures: [
      { base: 'today', caption: 'Today: editing a module', note: 'For comparison. Switching to a module, the preview follows you and is empty; the panel is titled “Pathogen Preview” whatever it shows, and there’s no chip.' },
      { base: 'opened', caption: '1 · Opened on the main', note: 'The preview button on main.pathogen’s tab. The chip, beside the zoom controls as in the playground, names the program shown, and so does the panel’s title.' },
      { base: 'list', caption: '2 · The program list', note: 'The main first, then entryPoints in order, each with its miniature, name and path; a check marks the program shown. Hovering a row shows Open in the editor.' },
      { base: 'list-toolbar', caption: '2 · Variant: the chip in the toolbar', note: 'The same list, opened from a chip in the preview’s toolbar instead of beside the zoom controls.' },
      { base: 'list-names', caption: '2 · Variant: names only', note: 'The same list without miniatures.' },
      { base: 'module', caption: '3 · Editing a module', note: 'toothDepth changed to 10 in parts/gears.pathogen: the preview stays on main and redraws. With the list open, a dot marks each program that uses the file you’re editing.' },
      { base: 'demo', caption: '4 · A demo’s preview button', note: 'The preview button on demos/train.pathogen’s tab shows that program and makes it the choice.' },
      { base: 'unlisted', caption: '5 · A program not in pathogen.json', note: 'Switching to sketch.pathogen leaves the preview on the program shown; the list adds it at the end, marked “not in pathogen.json”.' },
      { base: 'error', caption: '6 · Another program has an error', note: 'The chip’s red dot says another program has one, and its row says where. The program shown draws as usual.' },
      { base: 'broken', caption: '7 · The main is missing', note: 'pathogen.json lists poster.pathogen first, and it doesn’t exist: the preview shows the CLI’s message for a folder compile, and the chip still offers the other programs.' },
      { base: 'lone', caption: '8 · No pathogen.json: unchanged', note: 'The preview follows the file you’re editing, with no chip, as today. Only the panel’s title is new.' },
    ],
  },
  {
    dir: 'mockups-2g-project',
    stamp: '2026-11-23-12:02:13',
    slug: '2g-project-mockups-v1',
    title: '2g v1: Download source, and a workspace from a project',
    lede: 'Phase 2g, mockups v1 (note 68). The dev playground with the proposals added to the real page. v2 renamed the menu item and changed three states; the rest of v1 was approved as it is.',
    figures: [
      { base: '1a-menu', caption: '1a · The ⋮ menu', note: 'Download source, small text “A .zip of every file” (renamed Download workspace in v2).' },
      { base: '1b-downloaded', caption: '1b · Downloaded', note: 'The menu’s own feedback, “Downloaded Gear-studies.zip”. The card beside it is a note on the mockup, not part of the page.' },
      { base: '1c-menu-phone', caption: '1c · The menu on a phone', note: '', phone: true },
      { base: '2a-new', caption: '2a · The New Workspace page', note: 'A new section, Or import a project, with Choose folder…, Choose .zip… and a drop area.' },
      { base: '2b-dragging', caption: '2b · Dragging over the drop area', note: '' },
      { base: '2c-picked', caption: '2c · gears.zip picked', note: 'The name is filled in, and Starting Template goes. The card lists the programs in the list’s order with the main badged, then the modules.' },
      { base: '2d-left-out', caption: '2d · Files left out', note: 'Listed under “Not added”, with Upload’s reasons. The last line is an entryPoints entry that names a missing file.' },
      { base: '2e-no-pathogen-json', caption: '2e · No pathogen.json', note: 'Changed in v2: the card shows the pathogen.json the workspace will write.' },
      { base: '2f-refused', caption: '2f · More than 20 files', note: 'Nothing is added, and Create Workspace is off.' },
      { base: '2g-new-phone', caption: '2g · On a phone', note: 'Only Choose .zip…: phones can’t pick a folder.', phone: true },
      { base: '2h-picked-phone', caption: '2h · Picked, on a phone', note: '', phone: true },
      { base: '3a-copy-svg', caption: '3a · Copy SVG names the program', note: 'Small text “The program shown: try-sizes”.' },
      { base: '3b-export', caption: '3b · Export names the program', note: 'The modal titled “Export try-sizes”.' },
      { base: '3c-snapshot', caption: '3c · Snapshot names the program', note: '“Of try-sizes, the program shown”. The image is blank in the mockup; the real popover shows the drawing.' },
    ],
  },
  {
    dir: 'mockups-2g-project-v2',
    stamp: '2026-11-23-12:22:02',
    slug: '2g-project-mockups-v2',
    title: '2g v2: Download workspace, and the import’s pathogen.json',
    lede: 'Phase 2g, mockups v2 (note 69; approved 2026-11-23). The states that changed from v1 after your review.',
    figures: [
      { base: '1a-menu', caption: '1a · The ⋮ menu', note: 'The item renamed Download workspace.' },
      { base: '1b-downloaded', caption: '1b · Downloaded', note: '' },
      { base: '1c-menu-phone', caption: '1c · The menu on a phone', note: '', phone: true },
      { base: '2a-new', caption: '2a · The New Workspace page', note: 'The lead names “a .zip made by Download workspace”.' },
      { base: '2e-no-pathogen-json', caption: '2e · No pathogen.json', note: 'The card lists pathogen.json, marked new, and shows the file the workspace will write (from its own writer, projectFileText).' },
      { base: '2g-new-phone', caption: '2g · On a phone', note: '', phone: true },
      { base: '2i-malformed', caption: '2i · A pathogen.json that can’t be read', note: 'New in v2. The import stops with the CLI’s message, and Create Workspace is off.' },
      { base: '3a-copy-svg', caption: '3a · Copy SVG names the program', note: '' },
    ],
  },
  {
    dir: 'mockups-3a-data-files',
    stamp: '2026-11-23-16:41:07',
    slug: '3a-data-files-mockups-v1',
    title: '3a: data files in a workspace',
    lede: 'Phase 3a, mockups v1 (note 73), for your review with the drafted docs (<code>docs/workspace-files.md</code> “Data files”, <code>docs/data-import.md</code> “In the editor”). The dev playground with the data-file parts put into the page: the dev API holds <code>.pathogen</code> files only, so the stored <code>main.pathogen</code> holds the table inline, and the preview draws what the import would.',
    figures: [
      { base: '1a-tree-editor', caption: '1a · The tree and the editor', note: 'data/gears.json and data/profile.txt with their own icons; the gears.json tab keeps its extension; the JSON highlighted. (Question 1.)' },
      { base: '1b-json-error', caption: '1b · A mistake in the JSON', note: 'A comma missing: the editor marks line 3; the error sits under data/gears.json with “imported from main.pathogen line 2”; red dots on gears.json and main.pathogen. The preview keeps its last drawing, as for any error.' },
      { base: '1c-hover', caption: '1c · Hover on an imported name', note: '“gears — imported data”, then “data/gears.json · an array of 2 objects: name, x, y, radius, teeth”. (Question 6.)' },
      { base: '1d-completion', caption: '1d · Completion after gear.', note: 'The keys, each with its value’s type. The signature help above is the real one. (Question 6.)' },
      { base: '1e-tree-phone', caption: '1e · The tree on a phone', note: '', phone: true },
      { base: '2a-plus-menu', caption: '2a · The + menu', note: 'New data file, small text “JSON or text”, after New module. (Question 2.)' },
      { base: '2b-name-field', caption: '2b · The name field', note: 'In data/, holding trips.json, with no .pathogen after it; “Starts as [] · Enter to create, Esc to cancel”. (Question 2.)' },
      { base: '3a-upload-message', caption: '3a · An upload with data files', note: 'Added gears.json and profile.txt to data/ (marked in the tree); not added: trips.json (6.2 MB) and notes.md, each with its reason.' },
      { base: '3b-save-refused', caption: '3b · A save over the limit: today’s surface', note: 'The whole sentence in the save status, which squeezes the breadcrumb. (Question 3, option b.)' },
      { base: '3c-save-refused-toast', caption: '3c · A save over the limit: a toast', note: 'The save status reads “Not saved”, and a toast says why in two lines. (Question 3, option a: recommended.)' },
      { base: '3d-not-saved-status', caption: '3d · The toast closed', note: 'The save status at the breadcrumb’s right end still reads “Not saved”.' },
      { base: '4a-import-project', caption: '4a · A workspace from a project', note: 'Programs, the module, and the data files with a “data” label; under Not added, data/trips.json at 82 MB.' },
    ],
    after: `
  <section class="questions">
    <h2>Questions for you (note 73)</h2>
    <ol>
      <li><b>Icons</b> (1a): braces for JSON, a page with two lines for text. <i>Recommended: as shown.</i></li>
      <li><b>New data file</b> (2a, 2b): in the + menu, “JSON or text”; you type the extension; a new JSON file starts as <code>[]</code>, a text file empty. <i>Recommended: as shown</i>, or start JSON as <code>{}</code>.</li>
      <li><b>A save over a limit:</b> (a) “Not saved” in the save status and a two-line toast (3c, 3d), <i>recommended</i>; or (b) the whole sentence in the save status (3b).</li>
      <li><b>Copy Debug Info:</b> a data file comes with its size and first 20 lines, unless the error is in it, and lines over 200 characters are cut. <i>Recommended: yes.</i></li>
      <li><b>Public pages, snapshots and downloads</b> carry data files like every other file. <i>Recommended: yes.</i></li>
      <li><b>Hover and completion</b> (1c, 1d) as shown. <i>Recommended: yes.</i></li>
      <li><b>A project over 50 MB in all</b> adds nothing when it comes in as a new workspace, as one over 20 files does. <i>Recommended: yes.</i></li>
    </ol>
  </section>`,
  },
];

const STYLE = `
  :root { --bg: #f6f3ee; --fg: #1c1722; --muted: #5a4f6a; --card: #fff; --line: rgba(28,23,34,.1); }
  :root[data-theme="dark"] { --bg: #16131b; --fg: #ece8f2; --muted: #a79fb4; --card: #201c27; --line: rgba(255,255,255,.1); }
  body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 1360px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 0 0 8px; }
  .lede { color: var(--muted); max-width: 80ch; }
  .toggle { margin: 16px 0 24px; display: flex; gap: 8px; }
  .toggle button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
  .toggle button[aria-pressed="true"] { outline: 2px solid #9461c4; }
  .stack { display: grid; gap: 24px; }
  figure, .questions { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  figcaption { font-weight: 600; margin-bottom: 10px; }
  figure img { max-width: 100%; height: auto; display: block; border-radius: 6px; border: 1px solid var(--line); }
  figure.phone img { max-width: 420px; }
  figure p { color: var(--muted); margin: 10px 0 0; font-size: 14px; }
  .questions { margin-top: 24px; }
  .questions li { margin: 6px 0; }
  code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
  :root:not([data-theme="dark"]) img.dark, :root[data-theme="dark"] img.light { display: none; }
`;

const TOGGLE_SCRIPT = `
  for (const b of document.querySelectorAll('.toggle button')) {
    b.addEventListener('click', () => {
      document.documentElement.dataset.theme = b.dataset.theme;
      for (const o of document.querySelectorAll('.toggle button')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
`;

for (const set of SETS) {
  const folder = join(MODULES, set.dir);
  const img = (file: string): string => {
    const path = join(folder, file);
    if (!existsSync(path)) throw new Error(`${set.dir}: ${file} is missing`);
    return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  };
  const figures = set.figures
    .map(
      (f) => `
    <figure${f.phone ? ' class="phone"' : ''}><figcaption>${f.caption}</figcaption>
      <img class="light" src="${img(`${f.base}-light.png`)}" alt="${f.caption}, light">
      <img class="dark" src="${img(`${f.base}-dark.png`)}" alt="${f.caption}, dark">
      ${f.note ? `<p>${f.note}</p>` : ''}</figure>`,
    )
    .join('');
  const name = `${set.stamp}--modules--${set.slug}.bbwp.html`;
  writeFileSync(
    join(process.cwd(), 'website', 'bbwp', name),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${set.title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>${set.title}</h1>
  <p class="lede">${set.lede} Source: <code>project-docs/modules/${set.dir}/</code>.</p>
  <div class="toggle" role="group" aria-label="Theme">
    <button type="button" data-theme="light" aria-pressed="true">Light</button>
    <button type="button" data-theme="dark" aria-pressed="false">Dark</button>
  </div>
  <div class="stack">${figures}
  </div>${set.after ?? ''}
</main>
<script>${TOGGLE_SCRIPT}</script>
</body>
</html>
`,
  );
  console.log(`Wrote website/bbwp/${name} (${set.figures.length} states)`);
}
