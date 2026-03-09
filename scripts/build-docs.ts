import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import hljs from 'highlight.js/lib/core';

// Register languages we need
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');
const OUTPUT_FILE = join(ROOT, 'playground', 'utils', 'docs-content.js');
const STATIC_DOCS_DIR = join(ROOT, 'website', 'docs-static');
const HLJS_STYLES_DIR = join(ROOT, 'node_modules', 'highlight.js', 'styles');

// Configure marked with syntax highlighting
marked.use(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      // Use auto-detection for unlabeled code blocks (most of our DSL examples)
      if (!lang || lang === '') {
        // Try to detect if it looks like our DSL (has path commands or keywords)
        const looksLikeDSL = /^(let |fn |for |if |M |L |H |V |C |Q |A |Z |circle|rect|polygon|star)/m.test(code);
        if (looksLikeDSL) {
          // Highlight as JavaScript (close enough for our DSL)
          return hljs.highlight(code, { language: 'javascript', ignoreIllegals: true }).value;
        }
        // For other unlabeled blocks, try auto-detection
        return hljs.highlightAuto(code).value;
      }
      // Use specified language if available
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      // Fallback to auto-detection
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

// Decode common HTML entities to plain text
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Slugify heading text for use as an id attribute
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/&[^;]+;/g, '') // strip HTML entities
    .replace(/[^\w\s-]/g, '') // strip special chars
    .replace(/\s+/g, '-') // spaces to hyphens
    .replace(/-+/g, '-') // dedupe hyphens
    .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

// Mapping from markdown filenames to export names
const DOC_FILES: Record<string, string> = {
  'getting-started.md': 'gettingStarted',
  'syntax.md': 'syntax',
  'stdlib.md': 'stdlib',
  'layers.md': 'layers',
  'path-blocks.md': 'pathBlocks',
  'debug.md': 'debug',
  'cli.md': 'cli',
  'examples.md': 'examples',
};

// Fallback title from filename
function plainTitle(filename: string): string {
  return filename
    .replace('.md', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Heading {
  id: string;
  title: string;
  level: number;
}

interface TocEntry {
  key: string;
  title: string;
  headings: Heading[];
}

async function buildDocs(): Promise<void> {
  console.log('Building documentation...\n');

  const exports: Record<string, string> = {};
  const missing: string[] = [];
  const tocData: TocEntry[] = [];

  for (const [filename, exportName] of Object.entries(DOC_FILES)) {
    const filepath = join(DOCS_DIR, filename);

    try {
      const markdown = await fs.readFile(filepath, 'utf-8');

      // Per-section slug tracker and heading collector
      const seenSlugs = new Set<string>();
      const headings: Heading[] = [];
      // Section key prefix for globally unique IDs (e.g. "syntax-variables")
      const sectionPrefix = slugify(exportName.replace(/([A-Z])/g, '-$1'));

      const renderer = {
        heading({ tokens, depth }: { tokens: any[]; depth: number }) {
          const text = (this as any).parser.parseInline(tokens);
          const plainText = text.replace(/<[^>]*>/g, '');
          const baseSlug = slugify(plainText);
          let slug = `${sectionPrefix}-${baseSlug}`;

          // Deduplicate slugs within section
          if (seenSlugs.has(slug)) {
            let n = 2;
            while (seenSlugs.has(`${slug}-${n}`)) n++;
            slug = `${slug}-${n}`;
          }
          seenSlugs.add(slug);

          headings.push({ id: slug, title: decodeEntities(plainText), level: depth });
          return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
        },
      };

      const html = marked.use({ renderer }).parse(markdown) as string;
      exports[exportName] = html;

      // Extract section title from the first h1 heading
      const sectionTitle = headings.find((h) => h.level === 1)?.title || plainTitle(filename);
      tocData.push({
        key: exportName,
        title: sectionTitle,
        headings: headings.filter((h) => h.level >= 2),
      });

      console.log(`  ✓ ${filename} → ${exportName} (${headings.length} headings)`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        missing.push(filename);
        console.log(`  ✗ ${filename} (not found)`);
      } else {
        throw err;
      }
    }
  }

  if (missing.length > 0) {
    console.log(`\nWarning: ${missing.length} documentation file(s) not found.`);
    console.log('Create these files to complete the documentation:');
    missing.forEach((f) => console.log(`  - docs/${f}`));
    console.log('');
  }

  // Load highlight.js theme CSS
  console.log('\nLoading syntax highlighting themes...');
  const githubLight = await fs.readFile(join(HLJS_STYLES_DIR, 'github.css'), 'utf-8');
  const githubDark = await fs.readFile(join(HLJS_STYLES_DIR, 'github-dark.css'), 'utf-8');
  console.log('  ✓ github (light)');
  console.log('  ✓ github-dark');

  // Generate the JavaScript module
  let output = `// Auto-generated by scripts/build-docs.ts
// Do not edit manually - edit the markdown files in /docs/ instead

`;

  for (const [name, html] of Object.entries(exports)) {
    // Escape backticks and ${} for template literals
    const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

    output += `export const ${name} = \`${escaped}\`;\n\n`;
  }

  // Add a list of all available content for convenience
  const exportNames = Object.values(DOC_FILES).filter((name) => exports[name]);
  output += `// All available documentation sections\n`;
  output += `export const sections = {\n`;
  for (const name of exportNames) {
    output += `  ${name},\n`;
  }
  output += `};\n\n`;

  // Add TOC data for sidebar navigation
  const escapeTocJSON = JSON.stringify(tocData, null, 2)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  output += `// Structured table-of-contents data for sidebar navigation\n`;
  output += `export const tocData = JSON.parse(\`${escapeTocJSON}\`);\n\n`;

  // Add syntax highlighting theme CSS
  const escapeCSS = (css: string): string => css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  output += `// Syntax highlighting themes (GitHub light/dark)\n`;
  output += `export const hljsThemeLight = \`${escapeCSS(githubLight)}\`;\n\n`;
  output += `export const hljsThemeDark = \`${escapeCSS(githubDark)}\`;\n`;

  await fs.writeFile(OUTPUT_FILE, output);

  console.log(`Generated: playground/utils/docs-content.js`);
  console.log(`Exports: ${Object.keys(exports).join(', ')}`);

  // ─── Generate static HTML docs page ────────────────────────────────
  console.log('\nGenerating static docs HTML page...');

  // Build sidebar HTML
  const sidebarHtml = tocData
    .map((section: TocEntry) => {
      const headingsHtml = section.headings
        .map(
          (h: Heading) =>
            `<a class="sidebar-heading${h.level === 3 ? ' level-3' : ''}" href="#${h.id}">${decodeEntities(h.title)}</a>`,
        )
        .join('\n              ');
      return `
          <div class="sidebar-section expanded" data-section="${section.key}">
            <button class="section-toggle" data-section-toggle="${section.key}">
              <span class="chevron">&#9654;</span>
              ${decodeEntities(section.title)}
            </button>
            <div class="section-headings">
              ${headingsHtml}
            </div>
          </div>`;
    })
    .join('');

  // Build content HTML (all sections concatenated)
  const sectionKeys = Object.values(DOC_FILES).filter((name) => exports[name]);
  const contentHtml = sectionKeys
    .map((key) => `<section class="doc-section" data-section-key="${key}">${exports[key]}</section>`)
    .join('\n');

  const staticPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documentation — Pathogen</title>
  <meta name="description" content="Complete language reference for svg-path-extended — variables, expressions, control flow, functions, layers, and more.">
  <link rel="canonical" href="https://pedestal.design/pathogen/docs">
  <meta property="og:title" content="Documentation — Pathogen">
  <meta property="og:description" content="Complete language reference for svg-path-extended — variables, expressions, control flow, functions, layers, and more.">
  <meta property="og:url" content="https://pedestal.design/pathogen/docs">
  <meta property="og:type" content="website">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "name": "Pathogen Documentation",
    "description": "Complete language reference for svg-path-extended",
    "url": "https://pedestal.design/pathogen/docs",
    "publisher": { "@type": "Organization", "name": "Pedestal Design", "url": "https://pedestal.design" }
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baumans&family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/pathogen/styles/theme.css">
  <script>
    // Flash prevention — apply saved theme before paint
    (function(){var t=localStorage.getItem('pathogen-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-active-theme',t)}else{document.documentElement.setAttribute('data-active-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}})();
  </script>
  <style>
    /* Reset */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: var(--bg-primary, #f8f9fa);
      color: var(--text-primary, #1a1a2e);
    }

    /* Nav bar */
    .site-header {
      background: var(--bg-secondary, #ffffff);
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      position: sticky; top: 0; z-index: 50;
    }
    .site-header-inner {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1rem; height: 56px; gap: 1rem;
    }
    .logo {
      display: flex; flex-direction: column; text-decoration: none; line-height: 1.1; flex-shrink: 0;
    }
    .logo:hover .logo-main { color: var(--accent-color, #10b981); }
    .logo-main {
      font-family: 'Baumans', cursive; font-size: 1.5rem; font-weight: 400;
      color: var(--text-primary, #1a1a2e); transition: color 0.15s ease;
    }
    .logo-sub {
      font-family: 'Inconsolata', monospace; font-size: 0.6rem;
      color: var(--text-secondary, #64748b); white-space: nowrap;
    }
    .site-nav { display: flex; align-items: center; gap: 0.25rem; flex: 1; justify-content: center; }
    .nav-link {
      padding: 0.5rem 1rem; border-radius: 8px; text-decoration: none;
      color: var(--text-secondary, #64748b); font-size: 0.875rem; font-weight: 500;
      transition: all 0.15s ease;
    }
    .nav-link:hover { background: var(--hover-bg, rgba(0,0,0,0.04)); color: var(--text-primary, #1a1a2e); }
    .nav-link.active { background: var(--accent-color, #10b981); color: var(--accent-text, #ffffff); }

    /* Docs layout */
    .docs-layout { display: flex; height: calc(100vh - 56px); overflow: hidden; }

    /* Sidebar */
    .sidebar {
      width: 260px; min-width: 260px;
      background: var(--bg-primary, #f8f9fa);
      border-right: 1px solid var(--border-color, #e2e8f0);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .sidebar-header { padding: 1rem; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    .sidebar-header h1 { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
    .sidebar-header .subtitle { margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--text-secondary); }
    .sidebar-header .markdown-link { display: inline-block; margin-top: 0.375rem; font-size: 0.6875rem; color: var(--text-tertiary, #94a3b8); text-decoration: underline; }
    .sidebar-nav { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
    .sidebar-section { margin-bottom: 0.125rem; }
    .section-toggle {
      display: flex; align-items: center; gap: 0.375rem; width: 100%;
      padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 600;
      color: var(--text-primary); background: none; border: none; cursor: pointer;
      text-align: left; font-family: inherit; transition: background-color 0.15s;
    }
    .section-toggle:hover { background: var(--bg-secondary, #fff); }
    .section-toggle .chevron { font-size: 0.625rem; transition: transform 0.15s; color: var(--text-tertiary); }
    .sidebar-section.expanded .chevron { transform: rotate(90deg); }
    .section-headings { display: none; padding-bottom: 0.25rem; }
    .sidebar-section.expanded .section-headings { display: block; }
    .sidebar-heading {
      display: block; width: 100%; padding: 0.3125rem 1rem 0.3125rem 1.75rem;
      font-size: 0.8125rem; color: var(--text-secondary); text-decoration: none;
      transition: background-color 0.15s, color 0.15s;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sidebar-heading.level-3 { padding-left: 2.5rem; font-size: 0.75rem; }
    .sidebar-heading:hover { background: var(--bg-secondary, #fff); color: var(--text-primary); }
    .sidebar-heading.active { background: var(--accent-subtle, rgba(16,185,129,0.1)); color: var(--accent-color, #10b981); font-weight: 500; }

    /* Content area */
    .content-area { flex: 1; overflow-y: auto; min-width: 0; }
    .content-inner { max-width: 800px; margin: 0 auto; padding: 2rem; }
    section { margin-bottom: 3rem; }
    section h1 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 2px solid var(--accent-color, #10b981); }
    section h2 { margin: 1.5rem 0 1rem; font-size: 1.25rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    section h3 { margin: 1.5rem 0 0.75rem; font-size: 1rem; font-weight: 600; }
    section h4 { margin: 1rem 0 0.5rem; font-size: 0.9375rem; font-weight: 600; }
    p { margin: 0 0 1rem; line-height: 1.6; }
    code { font-family: 'Inconsolata', monospace; font-size: 0.875em; background: var(--bg-tertiary, #f0f1f2); padding: 0.125rem 0.375rem; border-radius: 3px; }
    pre { border-radius: 8px; overflow-x: auto; font-family: 'Inconsolata', monospace; font-size: 0.875rem; line-height: 1.5; margin: 0 0 1rem; }
    pre code { background: none; padding: 1rem; display: block; font-size: inherit; }
    ul, ol { margin: 0 0 1rem; padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.875rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    th { font-weight: 600; background: var(--bg-secondary, #fff); }
    td code { white-space: nowrap; }
    hr { border: none; border-top: 1px solid var(--border-color, #e2e8f0); margin: 2rem 0; }
    a { color: var(--accent-color, #10b981); }

    /* Syntax highlighting */
    ${githubDark.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}

    /* Mobile sidebar toggle */
    .sidebar-toggle {
      display: none; position: fixed; bottom: 1rem; left: 1rem; z-index: 10;
      width: 40px; height: 40px; border-radius: 50%;
      border: 1px solid var(--border-color); background: var(--bg-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer;
      font-size: 1.125rem; align-items: center; justify-content: center;
      color: var(--text-primary);
    }
    .sidebar-backdrop {
      display: none; position: fixed; inset: 0; z-index: 15; background: rgba(0,0,0,0.3);
    }
    .sidebar-backdrop.visible { display: block; }

    @media (max-width: 768px) {
      .site-header-inner { padding: 0 0.75rem; height: 52px; }
      .logo-sub { display: none; }
      .site-nav { gap: 0; }
      .nav-link { padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      .sidebar {
        position: fixed; top: 0; left: 0; bottom: 0; z-index: 20;
        transform: translateX(-100%); transition: transform 0.2s ease;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      }
      .sidebar.open { transform: translateX(0); }
      .sidebar-toggle { display: flex; }
      .docs-layout { height: calc(100vh - 52px); }
      .content-inner { padding: 1.5rem 1rem; }
      pre { font-size: 0.8125rem; }
      table { display: block; overflow-x: auto; }
    }
    @media (max-width: 600px) {
      .site-nav { display: none; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="logo" href="/pathogen/">
        <span class="logo-main">Pathogen</span>
        <span class="logo-sub">built on svg-path-extended v1.0</span>
      </a>
      <nav class="site-nav">
        <a class="nav-link" href="/pathogen/">Workspaces</a>
        <a class="nav-link active" href="/pathogen/docs">Docs</a>
        <a class="nav-link" href="/pathogen/explore">Explore</a>
        <a class="nav-link" href="/pathogen/featured">Featured</a>
        <a class="nav-link" href="/pathogen/blog">Blog</a>
        <a class="nav-link" href="/pathogen/preferences">Preferences</a>
      </nav>
      <theme-toggle></theme-toggle>
    </div>
  </header>

  <div class="sidebar-backdrop"></div>

  <div class="docs-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Documentation</h1>
        <p class="subtitle">svg-path-extended</p>
        <a href="/pathogen/docs/docs.md" class="markdown-link">View as Markdown</a>
      </div>
      <nav class="sidebar-nav">${sidebarHtml}
      </nav>
    </aside>

    <main class="content-area">
      <div class="content-inner">
        ${contentHtml}
      </div>
    </main>
  </div>

  <button class="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button>

  <script>
    // Progressive enhancement — scroll spy, collapsible sections, smooth scroll, mobile toggle
    (function() {
      var sidebar = document.querySelector('.sidebar');
      var backdrop = document.querySelector('.sidebar-backdrop');
      var toggle = document.querySelector('.sidebar-toggle');
      var contentArea = document.querySelector('.content-area');

      // Mobile sidebar toggle
      if (toggle) {
        toggle.addEventListener('click', function() {
          sidebar.classList.toggle('open');
          backdrop.classList.toggle('visible');
        });
      }
      if (backdrop) {
        backdrop.addEventListener('click', function() {
          sidebar.classList.remove('open');
          backdrop.classList.remove('visible');
        });
      }

      // Section toggle (collapse/expand)
      document.querySelectorAll('.section-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var section = btn.closest('.sidebar-section');
          if (section) section.classList.toggle('expanded');
        });
      });

      // Smooth scroll on sidebar link click
      document.querySelectorAll('.sidebar-heading').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          var id = link.getAttribute('href').slice(1);
          var target = document.getElementById(id);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', '#' + id);
            setActive(id);
            // Close mobile sidebar
            sidebar.classList.remove('open');
            backdrop.classList.remove('visible');
          }
        });
      });

      // Scroll spy via IntersectionObserver
      var headingEls = document.querySelectorAll('.content-area h2[id], .content-area h3[id]');
      var visibleMap = new Map();
      var suppressed = false;
      var suppressTimer;

      function setActive(id) {
        var prev = document.querySelector('.sidebar-heading.active');
        if (prev) prev.classList.remove('active');
        var next = document.querySelector('.sidebar-heading[href="#' + id + '"]');
        if (next) {
          next.classList.add('active');
          // Expand parent section
          var section = next.closest('.sidebar-section');
          if (section && !section.classList.contains('expanded')) {
            section.classList.add('expanded');
          }
          next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }

      if (headingEls.length > 0 && contentArea) {
        var observer = new IntersectionObserver(function(entries) {
          if (suppressed) return;
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              visibleMap.set(entry.target.id, entry.target);
            } else {
              visibleMap.delete(entry.target.id);
            }
          });
          if (visibleMap.size > 0) {
            var topmost = null, topY = Infinity;
            visibleMap.forEach(function(el) {
              var rect = el.getBoundingClientRect();
              if (rect.top < topY) { topY = rect.top; topmost = el; }
            });
            if (topmost) setActive(topmost.id);
          }
        }, { root: contentArea, rootMargin: '0px 0px -70% 0px', threshold: 0 });

        headingEls.forEach(function(el) { observer.observe(el); });
      }

      // Scroll to hash on load
      if (location.hash) {
        var target = document.getElementById(location.hash.slice(1));
        if (target) {
          requestAnimationFrame(function() {
            target.scrollIntoView({ block: 'start' });
            setActive(target.id);
          });
        }
      }
    })();
  </script>
  <script src="/pathogen/components/shared/theme-toggle.js" type="module"></script>
</body>
</html>`;

  await fs.mkdir(STATIC_DOCS_DIR, { recursive: true });
  await fs.writeFile(join(STATIC_DOCS_DIR, 'index.html'), staticPage);
  console.log(`Generated: website/docs-static/index.html`);

  // ─── Generate single-page markdown docs for AI/LLM consumption ─────
  console.log('\nGenerating single-page markdown docs...');

  const mdParts: string[] = [
    `# svg-path-extended Documentation`,
    '',
    `> This is the complete documentation for svg-path-extended in a single page.`,
    `> For the formatted version with navigation, see [the HTML docs](/pathogen/docs).`,
    '',
    '---',
  ];

  for (const filename of Object.keys(DOC_FILES)) {
    const filepath = join(DOCS_DIR, filename);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      mdParts.push('', content.trimEnd(), '', '---');
    } catch {
      // Skip missing files (already warned above)
    }
  }

  // Remove trailing separator
  if (mdParts[mdParts.length - 1] === '---') {
    mdParts.pop();
  }

  await fs.writeFile(join(STATIC_DOCS_DIR, 'docs.md'), `${mdParts.join('\n')}\n`);
  console.log(`Generated: website/docs-static/docs.md`);
}

const program = new Command();
program
  .name('build-docs')
  .description('Convert markdown docs to a JavaScript module')
  .action(async () => {
    try {
      await buildDocs();
    } catch (err) {
      console.error('Build failed:', err);
      process.exit(1);
    }
  });
program.parse();
