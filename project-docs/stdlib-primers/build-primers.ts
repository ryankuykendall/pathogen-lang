/**
 * Stdlib primer generator.
 *
 * Reads content/<fn>/primer.md (frontmatter + prose with {{example:NN-name}}
 * tokens) and content/<fn>/NN-name.pathogen example sources, compiles every
 * example in-process, and emits self-contained HTML pages:
 *   project-docs/stdlib-primers/<fn>.html  (one per primer)
 *   project-docs/stdlib-primers/index.html (the hub)
 *
 * Regenerate everything:  npx tsx project-docs/stdlib-primers/build-primers.ts
 * One primer:             ... --only hash01
 * Compile-check only:     ... --check
 */
import { Command } from 'commander';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Marked } from 'marked';
import { compile, generateSvg } from '../../src';
import { highlightPathogen } from '../../src/highlight';

const PRIMER_DIR = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(PRIMER_DIR, 'content');

// Copied from scripts/compile-samples.ts (project precedent: copy, don't import)
function autoDetectDimensions(source: string): { viewBox: string; width: string; height: string } {
  const defineMatch =
    /define\s+ViewBox\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/.exec(
      source,
    );
  if (defineMatch) {
    return {
      viewBox: `${defineMatch[1]} ${defineMatch[2]} ${defineMatch[3]} ${defineMatch[4]}`,
      width: defineMatch[3],
      height: defineMatch[4],
    };
  }
  const vbMatch = /viewBox[=:]\s*"?(-?\d+\s+-?\d+\s+\d+\s+\d+)"?/i.exec(source);
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/);
    return { viewBox: vbMatch[1], width: parts[2], height: parts[3] };
  }
  return { viewBox: '0 0 400 300', width: '400', height: '300' };
}

interface Frontmatter {
  fn: string;
  title: string;
  hook: string;
  order: number;
  docsAnchor: string; // e.g. stdlib-hash-noise
}

interface Primer {
  fm: Frontmatter;
  bodyHtml: string;
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function parseFrontmatter(raw: string, file: string): { fm: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) fail(`${file}: missing frontmatter block`);
  const fields: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].replace(/^"|"$/g, '');
  }
  for (const key of ['fn', 'title', 'hook', 'order', 'docsAnchor']) {
    if (!fields[key]) fail(`${file}: frontmatter missing "${key}"`);
  }
  return {
    fm: {
      fn: fields.fn,
      title: fields.title,
      hook: fields.hook,
      order: Number(fields.order),
      docsAnchor: fields.docsAnchor,
    },
    body: m[2],
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Compile one example file → { codeHtml, svg }. Throws with context on failure. */
function buildExample(dir: string, token: string, checkOnly: boolean): { codeHtml: string; svg: string } {
  const file = join(dir, `${token}.pathogen`);
  if (!existsSync(file)) fail(`${file}: referenced by {{example:${token}}} but does not exist`);
  const source = readFileSync(file, 'utf-8');
  const dims = autoDetectDimensions(source);
  let svg = '';
  try {
    const result = compile(source);
    svg = checkOnly
      ? ''
      : generateSvg(result, {
          viewBox: dims.viewBox,
          width: dims.width,
          height: dims.height,
          stroke: 'none', // build-layers defaults to #000 otherwise — invisible on the dark plate
          includeMetadata: false,
        });
  } catch (err) {
    fail(`${file}: compile failed — ${err instanceof Error ? err.message : String(err)}`);
  }
  return { codeHtml: highlightPathogen(source.trimEnd()), svg };
}

const SHARED_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-primary, #1e1e2e);
      color: var(--text-primary, #cdd6f4);
      font-family: var(--font-sans, system-ui, sans-serif);
      line-height: 1.65;
    }
    .wrap { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    .page-head { border-bottom: 1px solid var(--border-color, #313244); padding-bottom: 1.25rem; margin-bottom: 2rem; position: relative; }
    .eyebrow { font-size: 0.8rem; color: var(--text-secondary, #a6adc8); letter-spacing: 0.04em; text-transform: uppercase; }
    .eyebrow a { color: var(--accent-color, #89b4fa); text-decoration: none; }
    .page-head h1 { font-size: 2rem; margin: 0.35rem 0 0.25rem; }
    .page-head h1 code { font-family: var(--font-mono, ui-monospace, monospace); color: var(--accent-color, #89b4fa); }
    .hook { font-size: 1.1rem; color: var(--text-secondary, #a6adc8); font-style: italic; }
    theme-toggle { position: absolute; top: 0; right: 0; }
    .prose { margin-bottom: 1.5rem; }
    .prose p, .prose ul { margin-bottom: 0.9rem; max-width: 72ch; }
    .prose ul { padding-left: 1.4rem; }
    .prose li { margin-bottom: 0.35rem; }
    .prose h2 { font-size: 1.35rem; margin: 2.2rem 0 0.8rem; }
    .prose h3 { font-size: 1.1rem; margin: 1.6rem 0 0.6rem; }
    .prose code, .example-head code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.9em; background: var(--bg-elevated, #24243a); padding: 0.1em 0.35em; border-radius: 4px; }
    .prose a { color: var(--accent-color, #89b4fa); }
    .prose strong { color: var(--text-primary, #cdd6f4); }
    .example { margin: 2.75rem 0; border-top: 1px solid var(--border-color, #313244); padding-top: 1.6rem; }
    .example-head { font-size: 1.3rem; margin-bottom: 0.9rem; }
    .ex-num { display: inline-block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-color, #89b4fa); border: 1px solid var(--border-color, #313244); border-radius: 999px; padding: 0.1rem 0.6rem; margin-right: 0.6rem; vertical-align: middle; }
    pre.code {
      background: var(--bg-secondary, #181825);
      border: 1px solid var(--border-color, #313244);
      border-radius: 8px;
      padding: 1rem 1.2rem;
      overflow-x: auto;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.82rem;
      line-height: 1.55;
      margin: 1rem 0;
    }
    pre.code .kw  { color: var(--code-keyword, #c4a4e8); font-weight: 600; }
    pre.code .fn  { color: var(--code-fn, #f7b56e); }
    pre.code .num { color: var(--code-num, #f0a07b); }
    pre.code .str { color: var(--code-str, #8fc4a1); }
    pre.code .cm  { color: var(--code-comment, #7a6f8a); font-style: italic; }
    pre.code .op  { color: var(--code-op, #a8a0b8); }
    pre.code .tp  { color: var(--code-tp, #e8b48a); }
    pre.code .id  { color: var(--text-primary, #cdd6f4); }
    figure {
      /* Pinned dark: all example artwork is tuned for a dark plate; the
         light theme's --bg-elevated (#fff) washes out labels and scene
         fills, so the plate deliberately does NOT follow the theme. */
      background: #24243a;
      border: 1px solid var(--border-color, #313244);
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0 1.2rem;
      text-align: center;
    }
    figure svg { max-width: 100%; height: auto; }
    figcaption { font-size: 0.85rem; color: var(--text-secondary, #a6adc8); margin-top: 0.7rem; text-align: left; max-width: 72ch; margin-left: auto; margin-right: auto; }
    .page-foot { border-top: 1px solid var(--border-color, #313244); margin-top: 3rem; padding-top: 1.25rem; font-size: 0.9rem; color: var(--text-secondary, #a6adc8); }
    .page-foot nav { display: flex; justify-content: space-between; margin-bottom: 0.8rem; }
    .page-foot a { color: var(--accent-color, #89b4fa); text-decoration: none; }
    .page-foot .regen { font-size: 0.75rem; opacity: 0.7; margin-top: 0.6rem; }
`;

const THEME_BOOTSTRAP = `(function () {
      try {
        var stored = localStorage.getItem('pathogen-theme');
        var theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
    })();`;

function pageShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="../../playground/styles/theme.css">
  <script>${THEME_BOOTSTRAP}</script>
  <script type="module" src="../../public/components/shared/theme-toggle.js"></script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="wrap">
${bodyHtml}
  </div>
</body>
</html>
`;
}

function buildPrimer(fnName: string, all: Frontmatter[], checkOnly: boolean): Primer {
  const dir = join(CONTENT_DIR, fnName);
  const mdFile = join(dir, 'primer.md');
  if (!existsSync(mdFile)) fail(`${mdFile} not found`);
  const { fm, body } = parseFrontmatter(readFileSync(mdFile, 'utf-8'), mdFile);
  if (fm.fn !== fnName) fail(`${mdFile}: frontmatter fn "${fm.fn}" != directory "${fnName}"`);

  const marked = new Marked();
  let exampleIndex = 0;

  // Split the body on example tokens; render markdown between them, inject
  // example blocks at the tokens. The heading + intro/caption prose around a
  // token lives in the markdown itself.
  const parts = body.split(/\{\{example:([\w-]+)\}\}/g);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].trim()) html += marked.parse(parts[i]) as string;
    } else {
      exampleIndex++;
      const { codeHtml, svg } = buildExample(dir, parts[i], checkOnly);
      html += `<pre class="code"><code>${codeHtml}</code></pre>\n`;
      if (!checkOnly) html += `<figure>${svg}</figure>\n`;
    }
  }
  if (/\{\{example:/.test(html)) fail(`${mdFile}: unresolved {{example:...}} token survived substitution`);
  if (exampleIndex === 0) fail(`${mdFile}: no {{example:...}} tokens found`);

  const ordered = [...all].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((f) => f.fn === fm.fn);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const siblings = ordered
    .filter((f) => f.fn !== fm.fn)
    .map((f) => `<a href="./${f.fn}.html"><code>${f.fn}</code></a>`)
    .join(' · ');

  const bodyHtml = `  <header class="page-head">
    <p class="eyebrow"><a href="./index.html">Stdlib primers</a> · ${String(fm.order).padStart(2, '0')} of ${String(ordered.length).padStart(2, '0')}</p>
    <h1><code>${escapeHtml(fm.fn)}</code></h1>
    <p class="hook">${escapeHtml(fm.hook)}</p>
    <theme-toggle></theme-toggle>
  </header>
  <main class="prose">
${html}
  </main>
  <footer class="page-foot">
    <nav>
      <span>${prev ? `← <a href="./${prev.fn}.html"><code>${prev.fn}</code></a>` : ''}</span>
      <a href="./index.html">all primers</a>
      <span>${next ? `<a href="./${next.fn}.html"><code>${next.fn}</code></a> →` : ''}</span>
    </nav>
    <p>Reference: <a href="https://pathogen.studio/docs#${fm.docsAnchor}">${escapeHtml(fm.fn)} docs</a> · Siblings: ${siblings}</p>
    <p class="regen">Generated by project-docs/stdlib-primers/build-primers.ts — edit content/, not this file.</p>
  </footer>`;

  return { fm, bodyHtml };
}

function buildHub(fms: Frontmatter[]): string {
  const ordered = [...fms].sort((a, b) => a.order - b.order);
  const cards = ordered
    .map(
      (f) => `      <li>
        <span class="num">${String(f.order).padStart(2, '0')}</span>
        <a class="card" href="./${f.fn}.html"><code>${f.fn}</code><span class="hook-line">${escapeHtml(f.hook)}</span></a>
      </li>`,
    )
    .join('\n');
  const body = `  <header class="page-head">
    <p class="eyebrow">Pathogen · internal primers</p>
    <h1>Stdlib Primers</h1>
    <p class="hook">Seven standalone walkthroughs of the deterministic hash, noise, and shaping functions — what each one does, why you'd reach for it, and five worked examples from a bare number line to a finished composition.</p>
    <theme-toggle></theme-toggle>
  </header>
  <main class="prose">
    <p>Reading order matters a little: the hash trio (<code>hash01</code> → <code>hash11</code> → <code>hashRange</code>) builds one mental model in three steps, <code>smoothstep</code> sets up <code>bump</code>, and both set up the noise pair. Each page also stands alone.</p>
    <ul class="hub-list">
${cards}
    </ul>
    <p>Published reference: <a href="https://pathogen.studio/docs#stdlib-hash-noise">Hash &amp; Noise</a> · <a href="https://pathogen.studio/docs#stdlib-interpolation-clamping">Interpolation &amp; Clamping</a> · <a href="https://pathogen.studio/docs#stdlib-easing">Easing</a></p>
  </main>
  <footer class="page-foot">
    <p class="regen">Generated by project-docs/stdlib-primers/build-primers.ts — edit content/, not this file.</p>
  </footer>
  <style>
    .hub-list { list-style: none; padding: 0; }
    .hub-list li { display: flex; align-items: baseline; gap: 0.8rem; margin-bottom: 0.35rem; }
    .hub-list .num { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8rem; color: var(--text-secondary, #a6adc8); }
    .hub-list .card { text-decoration: none; color: var(--text-primary, #cdd6f4); }
    .hub-list .card code { color: var(--accent-color, #89b4fa); font-size: 1.05rem; margin-right: 0.6rem; }
    .hub-list .hook-line { color: var(--text-secondary, #a6adc8); font-style: italic; font-size: 0.95rem; }
  </style>`;
  return pageShell('Pathogen Stdlib Primers', body);
}

const program = new Command();
program
  .name('build-primers')
  .description('Generate the stdlib primer pages from content/')
  .option('--only <fn>', 'build a single primer (still writes the hub)')
  .option('--check', 'compile all examples without writing any output')
  .action(async (opts: { only?: string; check?: boolean }) => {
    const dirs = readdirSync(CONTENT_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (dirs.length === 0) fail(`no content directories in ${CONTENT_DIR}`);

    // Frontmatter for all primers (needed for prev/next even with --only)
    const fms: Frontmatter[] = dirs.map((d) => {
      const raw = readFileSync(join(CONTENT_DIR, d, 'primer.md'), 'utf-8');
      return parseFrontmatter(raw, join(CONTENT_DIR, d, 'primer.md')).fm;
    });

    const targets = opts.only ? dirs.filter((d) => d === opts.only) : dirs;
    if (opts.only && targets.length === 0) fail(`--only ${opts.only}: no such content directory`);

    for (const fnName of targets) {
      const primer = buildPrimer(fnName, fms, Boolean(opts.check));
      if (!opts.check) {
        const out = join(PRIMER_DIR, `${fnName}.html`);
        writeFileSync(out, pageShell(`${primer.fm.fn} — Pathogen stdlib primer`, primer.bodyHtml));
        console.log(`✓ ${fnName}.html`);
      } else {
        console.log(`✓ ${fnName} (check only)`);
      }
    }

    if (!opts.check) {
      writeFileSync(join(PRIMER_DIR, 'index.html'), buildHub(fms));
      console.log('✓ index.html (hub)');
    }
  });
program.parse();
