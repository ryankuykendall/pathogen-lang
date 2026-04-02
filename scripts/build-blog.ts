import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import hljs from 'highlight.js/lib/core';

// Register languages we need
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('toml', bash); // Close enough for toml highlighting
hljs.registerLanguage('pathogen', javascript); // Pathogen shares enough syntax with JS

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'website', 'blog');
const OUTPUT_FILE = join(ROOT, 'playground', 'utils', 'blog-content.js');
const STATIC_BLOG_DIR = join(ROOT, 'website', 'blog-static');
const HLJS_STYLES_DIR = join(ROOT, 'node_modules', 'highlight.js', 'styles');

// Configure marked with syntax highlighting
marked.use(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

interface Frontmatter {
  title?: string;
  slug?: string;
  date?: string;
  description?: string;
  [key: string]: string | undefined;
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter, content } where frontmatter is an object
 */
function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = frontmatterRegex.exec(markdown);

  if (!match) {
    return { frontmatter: {}, content: markdown };
  }

  const frontmatterText = match[1];
  const content = markdown.slice(match[0].length);

  // Simple YAML parser for our frontmatter format
  const frontmatter: Frontmatter = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, content };
}

interface BlogEntry {
  slug: string;
  title: string;
  date: string;
  description: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Process <mini-workspace src="..."> tags in HTML.
 * Reads the .pathogen source + .svg file, generates progressive-enhancement HTML.
 */
async function processMiniWorkspaceTags(html: string, blogDir: string): Promise<string> {
  // Match <mini-workspace src="..."> with optional attributes
  const tagRegex =
    /<mini-workspace\s+([^>]*?)src="([^"]+)"([^>]*?)(?:\/>|><\/mini-workspace>|>[\s\S]*?<\/mini-workspace>)/g;

  const replacements: { match: string; replacement: string }[] = [];

  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const [fullMatch, preAttrs, srcPath, postAttrs] = m;
    const allAttrs = `${preAttrs} ${postAttrs}`.trim();

    // Parse attributes
    const hasCodeOpen = /\bcode-open\b/.test(allAttrs);
    const captionMatch = /caption="([^"]*)"/.exec(allAttrs);
    const caption = captionMatch ? captionMatch[1] : '';

    // Resolve source file
    const sourceFile = join(blogDir, srcPath);
    let sourceCode = '';
    try {
      sourceCode = await fs.readFile(sourceFile, 'utf-8');
    } catch {
      console.warn(`  ⚠ mini-workspace: source not found: ${srcPath}`);
      continue;
    }

    // Read corresponding SVG file (same basename, .svg extension)
    const svgPath = sourceFile.replace(/\.[^.]+$/, '.svg');
    const svgFilename = srcPath.replace(/\.[^.]+$/, '.svg');
    let hasSvg = false;
    try {
      await fs.access(svgPath);
      hasSvg = true;
    } catch {
      // No SVG file available
    }

    // Build replacement HTML — raw source in <code> (HTML-escaped), no base64 or pre-highlighting.
    // The web component extracts source via textContent; CodeMirror highlights at runtime.
    const attrs = [hasCodeOpen ? 'code-open' : '', caption ? `caption="${caption}"` : '']
      .filter(Boolean)
      .join(' ');

    const svgFallback = hasSvg
      ? `\n  <img src="/pathogen/blog/${svgFilename}" alt="${caption || 'SVG preview'}" loading="lazy">`
      : '';

    const replacement = `<mini-workspace ${attrs}>
  <code>${escapeHtml(sourceCode)}</code>${svgFallback}
</mini-workspace>`;

    replacements.push({ match: fullMatch, replacement });
  }

  // Apply replacements
  for (const { match, replacement } of replacements) {
    html = html.replace(match, replacement);
  }

  return html;
}

async function buildBlog(): Promise<void> {
  console.log('Building blog...\n');

  // Check if blog directory exists
  try {
    await fs.access(BLOG_DIR);
  } catch {
    console.log('No blog directory found. Creating empty blog-content.js...');
    await fs.writeFile(
      OUTPUT_FILE,
      `// Auto-generated by scripts/build-blog.ts
// No blog posts found

export const blogIndex = [];
export const posts = {};
`,
    );
    return;
  }

  // Read all markdown files
  const files = await fs.readdir(BLOG_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  if (mdFiles.length === 0) {
    console.log('No markdown files found in website/blog/');
    await fs.writeFile(
      OUTPUT_FILE,
      `// Auto-generated by scripts/build-blog.ts
// No blog posts found

export const blogIndex = [];
export const posts = {};
`,
    );
    return;
  }

  const blogIndex: BlogEntry[] = [];
  const posts: Record<string, string> = {};

  for (const filename of mdFiles) {
    const filepath = join(BLOG_DIR, filename);
    const markdown = await fs.readFile(filepath, 'utf-8');

    const { frontmatter, content } = parseFrontmatter(markdown);

    // Validate required frontmatter
    if (!frontmatter.title || !frontmatter.slug || !frontmatter.date) {
      console.log(`  ✗ ${filename} (missing required frontmatter: title, slug, date)`);
      continue;
    }

    let html = marked.parse(content) as string;

    // Process <mini-workspace src="..."> tags
    html = await processMiniWorkspaceTags(html, BLOG_DIR);

    blogIndex.push({
      slug: frontmatter.slug,
      title: frontmatter.title,
      date: frontmatter.date,
      description: frontmatter.description || '',
    });

    posts[frontmatter.slug] = html;

    console.log(`  ✓ ${filename} → ${frontmatter.slug}`);
  }

  // Sort by date (newest first)
  blogIndex.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Generate the JavaScript module
  const escapeForTemplate = (str: string): string =>
    str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  let output = `// Auto-generated by scripts/build-blog.ts
// Do not edit manually - edit the markdown files in /website/blog/ instead

export const blogIndex = ${JSON.stringify(blogIndex, null, 2)};

export const posts = {
`;

  for (const [slug, html] of Object.entries(posts)) {
    output += `  '${slug}': \`${escapeForTemplate(html)}\`,\n`;
  }

  output += `};
`;

  await fs.writeFile(OUTPUT_FILE, output);

  console.log(`\nGenerated: playground/utils/blog-content.js`);
  console.log(`Posts: ${blogIndex.length}`);

  // ─── Generate static HTML blog pages ──────────────────────────────
  console.log('\nGenerating static blog HTML pages...');

  const githubDark = await fs.readFile(join(HLJS_STYLES_DIR, 'github-dark.css'), 'utf-8');

  await fs.mkdir(STATIC_BLOG_DIR, { recursive: true });

  const SITE_URL = 'https://pedestal.design';

  const navLinks = [
    { href: '/pathogen/', label: 'Workspaces', match: '/pathogen/' },
    { href: '/pathogen/docs', label: 'Docs', match: '/pathogen/docs' },
    { href: '/pathogen/explore', label: 'Explore', match: '/pathogen/explore' },
    { href: '/pathogen/featured', label: 'Featured', match: '/pathogen/featured' },
    { href: '/pathogen/blog', label: 'Blog', match: '/pathogen/blog' },
    { href: '/pathogen/preferences', label: 'Preferences', match: '/pathogen/preferences' },
  ];

  function renderNavHtml(activePath: string): string {
    return navLinks
      .map((link) => {
        const isActive =
          activePath === link.match || (link.match !== '/pathogen/' && activePath.startsWith(link.match));
        return `<a class="nav-link${isActive ? ' active' : ''}" href="${link.href}">${link.label}</a>`;
      })
      .join('\n          ');
  }

  function escapeHtmlAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderBlogShell({
    title,
    description,
    path,
    content,
    headExtra = '',
    breadcrumbs = [] as { label: string; href?: string }[],
  }: {
    title: string;
    description: string;
    path: string;
    content: string;
    headExtra?: string;
    breadcrumbs?: { label: string; href?: string }[];
  }): string {
    const fullTitle = `${title} — Pathogen`;
    const canonical = `${SITE_URL}${path}`;
    const navHtml = renderNavHtml('/pathogen/blog');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlAttr(fullTitle)}</title>
  <meta name="description" content="${escapeHtmlAttr(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtmlAttr(fullTitle)}">
  <meta property="og:description" content="${escapeHtmlAttr(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="article">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baumans&family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/pathogen/styles/theme.css">
  <script>
    // Flash prevention — apply saved theme before paint
    (function(){var t=localStorage.getItem('pathogen-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-active-theme',t)}else{document.documentElement.setAttribute('data-active-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}})();
  </script>
  ${headExtra}
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

    /* Breadcrumb */
    .breadcrumb-bar {
      background: var(--bg-primary, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      padding: 0.625rem 1rem;
      min-height: 32px;
      position: sticky; top: 56px; z-index: 40;
    }
    .breadcrumb {
      display: flex; align-items: center;
      font-size: 0.8125rem; color: var(--text-secondary, #666);
      max-width: 800px; margin: 0 auto;
    }
    .breadcrumb-link {
      color: var(--text-secondary, #666); text-decoration: none;
      transition: color 0.15s ease;
    }
    .breadcrumb-link:hover { color: var(--accent-color, #10b981); text-decoration: underline; }
    .breadcrumb-current { color: var(--text-primary, #1a1a2e); font-weight: 500; }
    .breadcrumb .separator { margin: 0 0.5rem; color: var(--text-tertiary, #94a3b8); }

    /* Blog content area */
    .blog-main { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }

    /* Content styling — mirrors docs content area */
    .blog-content h2 { margin: 1.5rem 0 1rem; font-size: 1.25rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    .blog-content h3 { margin: 1.5rem 0 0.75rem; font-size: 1rem; font-weight: 600; }
    .blog-content h4 { margin: 1rem 0 0.5rem; font-size: 0.9375rem; font-weight: 600; }
    .blog-content p { margin: 0 0 1rem; line-height: 1.6; }
    code { font-family: 'Inconsolata', monospace; font-size: 0.875em; background: var(--bg-tertiary, #f0f1f2); padding: 0.125rem 0.375rem; border-radius: 3px; }
    pre { border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 0.875rem; line-height: 1.5; margin: 0 0 1rem; }
    pre code { background: none; padding: 1rem; display: block; font-size: inherit; font-family: inherit; }
    .blog-content ul, .blog-content ol { margin: 0 0 1rem; padding-left: 1.5rem; }
    .blog-content li { margin-bottom: 0.5rem; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.875rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border-color, #e2e8f0); }
    th { font-weight: 600; background: var(--bg-secondary, #fff); }
    td code { white-space: nowrap; }
    hr { border: none; border-top: 1px solid var(--border-color, #e2e8f0); margin: 2rem 0; }
    .blog-content a { color: var(--accent-color, #10b981); }
    .blog-content img { max-width: 100%; height: auto; border-radius: 8px; }
    .blog-content blockquote { border-left: 3px solid var(--accent-color, #10b981); padding-left: 1rem; margin: 0 0 1rem; color: var(--text-secondary, #64748b); }
    reactive-svg { display: block; margin: 1.5rem 0; }

    /* Blog index cards */
    .blog-cards { display: flex; flex-direction: column; gap: 1.5rem; }
    .blog-card {
      display: block; padding: 1.5rem; border-radius: 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-secondary, #fff);
      text-decoration: none; color: inherit;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .blog-card:hover {
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
      border-color: var(--accent-color, #10b981);
    }
    .blog-card h2 { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 600; border: none; padding: 0; }
    .blog-card time { font-size: 0.8125rem; color: var(--text-tertiary, #94a3b8); }
    .blog-card p { margin: 0.5rem 0 0; font-size: 0.9375rem; color: var(--text-secondary, #64748b); line-height: 1.5; }

    /* Post header */
    .post-header { margin-bottom: 2rem; }
    .post-header h1 { font-size: 1.75rem; font-weight: 600; margin-bottom: 0.5rem; }
    .post-meta { font-size: 0.875rem; color: var(--text-secondary, #64748b); }
    .back-link { display: inline-block; margin-bottom: 1.5rem; font-size: 0.875rem; color: var(--accent-color, #10b981); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }

    /* Syntax highlighting */
    ${githubDark.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}

    @media (max-width: 768px) {
      .site-header-inner { padding: 0 0.75rem; height: 52px; }
      .breadcrumb-bar { top: 52px; }
      .logo-sub { display: none; }
      .site-nav { gap: 0; }
      .nav-link { padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
      .blog-main { padding: 1.5rem 0.75rem; }
      .blog-content pre { font-size: 0.8125rem; }
      .blog-content table { display: block; overflow-x: auto; }
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
          ${navHtml}
      </nav>
      <theme-toggle></theme-toggle>
    </div>
  </header>
  ${
    breadcrumbs.length > 0
      ? `<div class="breadcrumb-bar"><nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbs
          .map(
            (crumb, i) =>
              `${i > 0 ? '<span class="separator">/</span>' : ''}${
                crumb.href
                  ? `<a class="breadcrumb-link" href="${crumb.href}">${crumb.label}</a>`
                  : `<span class="breadcrumb-current">${crumb.label}</span>`
              }`,
          )
          .join('')}</nav></div>`
      : ''
  }
  <main class="blog-main">
    ${content}
  </main>
  <script src="/pathogen/components/shared/theme-toggle.js" type="module"></script>
  <script src="/pathogen/components/blog/reactive-svg.js" type="module"></script>
  <script src="/pathogen/components/blog/mini-workspace.js" type="module"></script>
  <script src="/pathogen/components/blog/mini-preview.js" type="module"></script>
</body>
</html>`;
  }

  // Generate blog index page
  const blogPostingsJsonLd = blogIndex.map((entry) => ({
    '@type': 'BlogPosting',
    headline: entry.title,
    description: entry.description,
    datePublished: entry.date,
    url: `${SITE_URL}/pathogen/blog/${entry.slug}`,
  }));

  const indexJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Pathogen Blog',
    description: 'Thoughts, tutorials, and updates about svg-path-extended',
    url: `${SITE_URL}/pathogen/blog`,
    publisher: { '@type': 'Organization', name: 'Pedestal Design', url: SITE_URL },
    blogPost: blogPostingsJsonLd,
  });

  const indexCards = blogIndex
    .map((entry) => {
      const dateFormatted = new Date(entry.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return `    <article class="blog-card" onclick="location.href='/pathogen/blog/${entry.slug}'">
      <a href="/pathogen/blog/${entry.slug}" style="text-decoration:none;color:inherit;display:block;">
        <h2>${escapeHtmlAttr(entry.title)}</h2>
        <time datetime="${entry.date}">${dateFormatted}</time>
        ${entry.description ? `<p>${escapeHtmlAttr(entry.description)}</p>` : ''}
      </a>
    </article>`;
    })
    .join('\n');

  const indexPage = renderBlogShell({
    title: 'Blog',
    description: 'Thoughts, tutorials, and updates about svg-path-extended',
    path: '/pathogen/blog',
    breadcrumbs: [{ label: 'Workspaces', href: '/pathogen/' }, { label: 'Blog' }],
    content: `
    <h1>Blog</h1>
    <p style="color:var(--text-secondary);margin-bottom:2rem;">Thoughts, tutorials, and updates about svg-path-extended</p>
    <div class="blog-cards">
${indexCards}
    </div>`,
    headExtra: `<script type="application/ld+json">${indexJsonLd}</script>`,
  });

  await fs.writeFile(join(STATIC_BLOG_DIR, 'index.html'), indexPage);
  console.log('  ✓ blog-static/index.html');

  // Generate individual post pages
  for (const entry of blogIndex) {
    const html = posts[entry.slug];
    if (!html) continue;

    const dateFormatted = new Date(entry.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const postJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: entry.title,
      description: entry.description,
      datePublished: entry.date,
      url: `${SITE_URL}/pathogen/blog/${entry.slug}`,
      author: { '@type': 'Organization', name: 'Pedestal Design', url: SITE_URL },
    });

    const postPage = renderBlogShell({
      title: entry.title,
      description: entry.description || `${entry.title} — a blog post from Pathogen`,
      path: `/pathogen/blog/${entry.slug}`,
      breadcrumbs: [
        { label: 'Workspaces', href: '/pathogen/' },
        { label: 'Blog', href: '/pathogen/blog' },
        { label: entry.title },
      ],
      content: `<article>
      <header class="post-header">
        <h1>${escapeHtmlAttr(entry.title)}</h1>
        <p class="post-meta"><time datetime="${entry.date}">${dateFormatted}</time></p>
      </header>
      <div class="blog-content">
        ${html.replace(/^<h1[^>]*>[\s\S]*?<\/h1>\n?/, '')}
      </div>
    </article>`,
      headExtra: `<script type="application/ld+json">${postJsonLd}</script>`,
    });

    await fs.writeFile(join(STATIC_BLOG_DIR, `${entry.slug}.html`), postPage);
    console.log(`  ✓ blog-static/${entry.slug}.html`);
  }

  console.log(`\nStatic blog pages: ${blogIndex.length + 1} files`);
}

const program = new Command();
program
  .name('build-blog')
  .description('Convert blog markdown posts to a JavaScript module')
  .action(async () => {
    try {
      await buildBlog();
    } catch (err) {
      console.error('Build failed:', err);
      process.exit(1);
    }
  });
program.parse();
