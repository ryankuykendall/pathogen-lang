/**
 * CloudFlare Pages Worker — Pathogen Studio site at pathogen.studio.
 *
 * Renders SSR HTML for the marketing homepage, /explore, /featured,
 * /u/:handle, and serves the SPA shell + static blog/docs assets.
 *
 * API endpoints (/api/*) live on the dedicated pathogen-api Worker at
 * api.pathogen.studio (see api/wrangler.toml). The session cookie is
 * scoped to .pathogen.studio so getSsrUser() here reads the same session
 * the API issued.
 */

import { getSessionUserId, readSessionTokenFromRequest } from './auth/session.js';
import { findUserById, findUserByHandle } from './auth/users.js';
import { siteHeaderHtml } from '../playground/utils/site-header-template.js';
import type {
  Env,
  PublicIndexEntry,
  SsrUser,
  Workspace,
} from './api/types.js';
import { latestBlogPost } from './generated/blog-data.js';

// ─── SEO Page Rendering ───────────────────────────────────────────────

const SITE_URL = 'https://pathogen.studio';

async function getSsrUser(request: Request, env: Env): Promise<SsrUser | null> {
  if (!env.USERS_DB) return null;
  const token = readSessionTokenFromRequest(request);
  if (!token) return null;
  try {
    const userId = await getSessionUserId(env.USERS_DB, token);
    if (!userId) return null;
    const user = await findUserById(env.USERS_DB, userId);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      handle: user.handle,
    };
  } catch {
    return null;
  }
}

function initialOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/);
  if (second) return (first[0] + second[0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function renderPage({
  title,
  description,
  path,
  content,
  headExtra = '',
  currentUser = null,
}: {
  title: string;
  description?: string;
  path: string;
  content: string;
  headExtra?: string;
  currentUser?: SsrUser | null;
}): string {
  const fullTitle = title ? `${title} — Pathogen Studio` : 'Pathogen Studio — SVG Path Extended Playground';
  const desc =
    description ||
    'A visual playground for svg-path-extended — variables, expressions, control flow, functions, and more for SVG paths.';
  const canonical = `${SITE_URL}${path}`;
  const ssrUserScript = currentUser
    ? `<script>window.__SSR_CURRENT_USER=${JSON.stringify(currentUser).replace(/</g, '\\u003c')};</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baumans&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display:ital@0;1&family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/pathogen/styles/theme.css">
  <link rel="stylesheet" href="/pathogen/styles/site-header.css">
  <script>
    // Flash prevention — apply saved theme before paint
    (function(){var t=localStorage.getItem('pathogen-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-active-theme',t)}else{document.documentElement.setAttribute('data-active-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}})();
  </script>
  ${ssrUserScript}
  ${headExtra}
  <style>
    /* body styles (font-family, background, atmospheric grain) are defined
     * globally in /pathogen/styles/theme.css. */

    /* Site header is shared via /pathogen/styles/site-header.css */
    .site-header { position: sticky; top: 0; z-index: 50; }

    .site-main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    @media (max-width: 768px) {
      .site-main { padding: 1.5rem 0.75rem; }
    }
  </style>
</head>
<body>
  ${siteHeaderHtml({ pathname: path, context: 'static' })}
  <main class="site-main">
    ${content}
  </main>
  <script src="/pathogen/components/shared/theme-toggle.js" type="module"></script>
  <script src="/pathogen/components/shared/account-menu.js" type="module"></script>
</body>
</html>`;
}


// ─── Explore Page (Worker-Rendered) ───────────────────────────────────

async function renderExplorePage(request: Request, env: Env, url: URL): Promise<Response> {
  const currentUser = await getSsrUser(request, env);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = 24;

  let workspaces: PublicIndexEntry[] = [];
  try {
    const raw = await env.WORKSPACES.get('public:workspaces');
    if (raw) workspaces = JSON.parse(raw);
  } catch {
    /* empty index */
  }

  const total = workspaces.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const slice = workspaces.slice(start, start + perPage);

  let cardsHtml: string;
  if (slice.length === 0) {
    cardsHtml = `<p style="text-align:center;color:var(--text-secondary);padding:3rem 0;">No public workspaces yet. Create one and make it public!</p>`;
  } else {
    cardsHtml = `<div class="explore-grid">${slice
      .map((ws: PublicIndexEntry) => {
        const thumbUrl = ws.thumbnailAt ? `https://api.pathogen.studio/thumbnail/${ws.id}/512` : '';
        const desc = ws.description ? ws.description.slice(0, 120) + (ws.description.length > 120 ? '...' : '') : '';
        const date = ws.updatedAt
          ? new Date(ws.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const href = `/pathogen/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
        return `<article class="explore-card-wrap"><a class="explore-card" href="${href}">
        <div class="explore-thumb">${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy">` : `<div class="explore-placeholder"></div>`}</div>
        <div class="explore-info">
          <h3>${escapeHtml(ws.name || 'Untitled')}</h3>
          ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
          ${date ? `<time>${date}</time>` : ''}
        </div>
      </a></article>`;
      })
      .join('')}</div>`;
  }

  // Pagination
  let paginationHtml = '';
  if (totalPages > 1) {
    const links: string[] = [];
    if (page > 1) links.push(`<a class="page-link" href="/pathogen/explore?page=${page - 1}">&larr; Previous</a>`);
    links.push(`<span class="page-info">Page ${page} of ${totalPages}</span>`);
    if (page < totalPages) links.push(`<a class="page-link" href="/pathogen/explore?page=${page + 1}">Next &rarr;</a>`);
    paginationHtml = `<div class="pagination">${links.join('')}</div>`;
  }

  const content = `
    <h1>Explore Public Workspaces</h1>
    <p class="explore-subtitle">Discover what others are creating with svg-path-extended</p>
    ${cardsHtml}
    ${paginationHtml}
  `;

  const headExtra = `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Explore Public Workspaces",
    "description": "Browse public workspaces created with svg-path-extended",
    "url": "https://pathogen.studio/pathogen/explore",
    "publisher": { "@type": "Organization", "name": "Pedestal Design", "url": "https://pathogen.studio" }
  }
  </script>
  <style>
    .explore-subtitle { color: var(--text-secondary); margin-bottom: 2rem; }
    .explore-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .explore-card-wrap { display: contents; }
    .explore-card {
      border-radius: 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-secondary, #fff);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .explore-card:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--accent-color, #10b981);
    }
    .explore-thumb {
      aspect-ratio: 4/3;
      background: var(--bg-tertiary, #f0f1f2);
      overflow: hidden;
    }
    .explore-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .explore-placeholder { width: 100%; height: 100%; }
    .explore-info { padding: 0.75rem 1rem; }
    .explore-info h3 { margin: 0 0 0.25rem; font-size: 0.9375rem; }
    .explore-info p { margin: 0 0 0.25rem; font-size: 0.8125rem; color: var(--text-secondary); }
    .explore-info time { font-size: 0.75rem; color: var(--text-tertiary); }
    .pagination {
      display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 2rem;
    }
    .page-link {
      padding: 0.5rem 1rem; border-radius: 8px;
      border: 1px solid var(--border-color); text-decoration: none;
      color: var(--accent-color); font-size: 0.875rem;
    }
    .page-link:hover { background: var(--accent-subtle); }
    .page-info { font-size: 0.875rem; color: var(--text-secondary); }
    @media (max-width: 900px) { .explore-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .explore-grid { grid-template-columns: 1fr; } }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  </style>`;

  const html = renderPage({
    title: 'Explore',
    description: 'Browse public workspaces created with svg-path-extended',
    path: '/pathogen/explore',
    content,
    headExtra,
    currentUser,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, max-age=30',
    },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Public Profile Page (Worker-Rendered) ────────────────────────────

async function renderProfilePage(request: Request, env: Env, url: URL, handle: string): Promise<Response> {
  if (!env.USERS_DB) {
    return new Response('Profiles are not enabled on this deployment.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const currentUser = await getSsrUser(request, env);
  const user = await findUserByHandle(env.USERS_DB, handle);
  if (!user) {
    const html = renderPage({
      title: 'Profile not found',
      description: 'No Pathogen profile with that handle.',
      path: url.pathname,
      content: `<h1>Profile not found</h1><p>No user with handle <code>${escapeHtml(handle)}</code>.</p><p><a href="/pathogen/explore">Browse public workspaces &rarr;</a></p>`,
      currentUser,
    });
    return new Response(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  let entries: PublicIndexEntry[] = [];
  try {
    const raw = await env.WORKSPACES.get('public:workspaces');
    if (raw) entries = JSON.parse(raw);
  } catch {
    /* empty */
  }
  const candidates = entries.filter((e: PublicIndexEntry) => e.userId === user.id);

  // Stale-index defense: each public:workspaces entry is verified against
  // the underlying workspace:<id> record. Skip entries where the record is
  // missing (deleted-but-not-deindexed) or where isPublic has flipped to
  // false. Trades N KV reads per profile-render for correctness.
  const workspaces: PublicIndexEntry[] = [];
  for (const entry of candidates) {
    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${entry.id}`);
      if (!wsJson) continue;
      const ws: Workspace = JSON.parse(wsJson);
      if (!ws.isPublic) continue;
      if (ws.userId !== user.id) continue;
      workspaces.push(entry);
    } catch {
      /* skip malformed records */
    }
  }

  let cardsHtml: string;
  if (workspaces.length === 0) {
    cardsHtml = `<p style="text-align:center;color:var(--text-secondary);padding:3rem 0;">${escapeHtml(user.display_name)} hasn't shared any public workspaces yet.</p>`;
  } else {
    cardsHtml = `<div class="explore-grid">${workspaces
      .map((ws: PublicIndexEntry) => {
        const thumbUrl = ws.thumbnailAt ? `https://api.pathogen.studio/thumbnail/${ws.id}/512` : '';
        const desc = ws.description ? ws.description.slice(0, 120) + (ws.description.length > 120 ? '...' : '') : '';
        const date = ws.updatedAt
          ? new Date(ws.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const href = `/pathogen/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
        return `<article class="explore-card-wrap"><a class="explore-card" href="${href}">
        <div class="explore-thumb">${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy">` : `<div class="explore-placeholder"></div>`}</div>
        <div class="explore-info">
          <h3>${escapeHtml(ws.name || 'Untitled')}</h3>
          ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
          ${date ? `<time>${date}</time>` : ''}
        </div>
      </a></article>`;
      })
      .join('')}</div>`;
  }

  const content = `
    <h1>${escapeHtml(user.display_name)}</h1>
    <p class="profile-handle"><span>@${escapeHtml(user.handle)}</span></p>
    ${cardsHtml}
  `;

  const headExtra = `<style>
    .profile-handle { color: var(--text-secondary); margin: 0 0 2rem; font-family: var(--font-mono, 'Inconsolata', monospace); font-size: 0.9375rem; }
    .explore-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .explore-card-wrap { display: contents; }
    .explore-card {
      border-radius: 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-secondary, #fff);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .explore-card:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--accent-color, #10b981);
    }
    .explore-thumb {
      aspect-ratio: 4/3;
      background: var(--bg-tertiary, #f0f1f2);
      overflow: hidden;
    }
    .explore-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .explore-placeholder { width: 100%; height: 100%; }
    .explore-info { padding: 0.75rem 1rem; }
    .explore-info h3 { margin: 0 0 0.25rem; font-size: 0.9375rem; }
    .explore-info p { margin: 0 0 0.25rem; font-size: 0.8125rem; color: var(--text-secondary); }
    .explore-info time { font-size: 0.75rem; color: var(--text-tertiary); }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    @media (max-width: 900px) { .explore-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .explore-grid { grid-template-columns: 1fr; } }
  </style>`;

  const html = renderPage({
    title: `${user.display_name} (@${user.handle})`,
    description: `Public Pathogen workspaces by ${user.display_name}`,
    path: url.pathname,
    content,
    headExtra,
    currentUser,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, max-age=30',
    },
  });
}

// ─── Featured Page (Worker-Rendered) ──────────────────────────────────

async function renderFeaturedPage(request: Request, env: Env, _url: URL): Promise<Response> {
  const currentUser = await getSsrUser(request, env);
  let featuredIds: string[] = [];
  try {
    const raw = await env.WORKSPACES.get('featured:workspaces');
    if (raw) featuredIds = JSON.parse(raw);
  } catch {
    /* empty */
  }

  // Fetch workspace metadata in parallel
  const workspaces = (
    await Promise.all(
      featuredIds.map(async (id: string) => {
        try {
          const raw = await env.WORKSPACES.get(`workspace:${id}`);
          if (!raw) return null;
          const ws: Workspace = JSON.parse(raw);
          if (!ws.isPublic) return null;
          return ws;
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean) as Workspace[];

  let cardsHtml: string;
  if (workspaces.length === 0) {
    cardsHtml = `<p style="text-align:center;color:var(--text-secondary);padding:3rem 0;">No featured workspaces yet. Check back soon!</p>`;
  } else {
    cardsHtml = `<div class="featured-grid">${workspaces
      .map((ws: Workspace) => {
        const thumbUrl = ws.thumbnailAt ? `https://api.pathogen.studio/thumbnail/${ws.id}/512` : '';
        const desc = ws.description ? ws.description.slice(0, 200) + (ws.description.length > 200 ? '...' : '') : '';
        const href = `/pathogen/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
        return `<article class="featured-card-wrap"><a class="featured-card" href="${href}">
        <div class="featured-thumb">${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy">` : `<div class="featured-placeholder"></div>`}</div>
        <div class="featured-info">
          <h3>${escapeHtml(ws.name || 'Untitled')}</h3>
          ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
        </div>
      </a></article>`;
      })
      .join('')}</div>`;
  }

  const content = `
    <h1>Featured Workspaces</h1>
    <p class="featured-subtitle">Hand-picked examples showcasing what's possible with svg-path-extended</p>
    ${cardsHtml}
  `;

  const headExtra = `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Featured Workspaces",
    "description": "Hand-picked svg-path-extended workspace showcases",
    "url": "https://pathogen.studio/pathogen/featured",
    "publisher": { "@type": "Organization", "name": "Pedestal Design", "url": "https://pathogen.studio" }
  }
  </script>
  <style>
    .featured-subtitle { color: var(--text-secondary); margin-bottom: 2rem; }
    .featured-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2rem;
    }
    .featured-card-wrap { display: contents; }
    .featured-card {
      border-radius: 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-secondary, #fff);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .featured-card:hover {
      box-shadow: var(--shadow-lg);
      border-color: var(--accent-color, #10b981);
    }
    .featured-thumb {
      aspect-ratio: 16/9;
      background: var(--bg-tertiary, #f0f1f2);
      overflow: hidden;
    }
    .featured-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .featured-placeholder { width: 100%; height: 100%; }
    .featured-info { padding: 1rem 1.25rem; }
    .featured-info h3 { margin: 0 0 0.5rem; font-size: 1.125rem; }
    .featured-info p { margin: 0; font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; }
    @media (max-width: 700px) { .featured-grid { grid-template-columns: 1fr; } }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  </style>`;

  const html = renderPage({
    title: 'Featured',
    description: 'Hand-picked svg-path-extended workspace showcases',
    path: '/pathogen/featured',
    content,
    headExtra,
    currentUser,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, max-age=30',
    },
  });
}


// ─── Marketing Homepage (Worker-Rendered) ─────────────────────────────

interface ShowcaseTile {
  slug: string;
  label: string;
  src: string;
  alt: string;
}

const HOMEPAGE_SHOWCASE_TILES: ShowcaseTile[] = [
  {
    slug: 'gradient-linear-radial',
    label: 'Linear Gradients',
    src: '/pathogen/blog/samples/post1/linear-basics.svg',
    alt: 'Linear and radial gradients composed into a layered landscape',
  },
  {
    slug: 'gradient-conic',
    label: 'Conic Gradient',
    src: '/pathogen/blog/samples/post2/color-wheel.svg',
    alt: 'Conic gradient color wheel rendered via WebGPU',
  },
  {
    slug: 'gradient-mesh-freeform',
    label: 'Mesh Gradient',
    src: '/pathogen/blog/samples/post3/mesh-basics.svg',
    alt: '2x2 mesh gradient with bilinear OKLCH interpolation',
  },
  {
    slug: 'pathblock-parametric-sampling',
    label: 'Parametric Sampling',
    src: '/pathogen/blog/samples/post7/sampling-anatomy.svg',
    alt: 'PathBlock parametric sampling — get(), tangent(), and normal() at t = 0.4',
  },
  {
    slug: 'grid-functions',
    label: 'Grids',
    src: '/pathogen/blog/samples/post15/square-grid-patterns.svg',
    alt: 'Procedural square grid patterns',
  },
  {
    slug: 'heading-turn',
    label: 'Tangents',
    src: '/pathogen/blog/samples/post14/heading-turn-demo.svg',
    alt: 'Tangent control curves — C, S, zigzag, and spiral',
  },
];

async function renderHomepage(request: Request, env: Env, _url: URL): Promise<Response> {
  const currentUser = await getSsrUser(request, env);

  const showcaseTilesHtml = HOMEPAGE_SHOWCASE_TILES.map(
    (tile) =>
      `<a class="dev-tile" href="/pathogen/blog/${tile.slug}">
          <img src="${tile.src}" alt="${escapeHtml(tile.alt)}" loading="lazy">
          <span class="dev-tile-label">${escapeHtml(tile.label)}</span>
        </a>`,
  ).join('\n        ');

  const blogDateFormatted = latestBlogPost
    ? new Date(latestBlogPost.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const blogCardHtml = latestBlogPost
    ? `<a class="dev-blog" href="/pathogen/blog/${latestBlogPost.slug}">
            <p class="blog-eyebrow">From the blog · Latest</p>
            <h3 class="blog-title">${escapeHtml(latestBlogPost.title)}</h3>
            <p class="blog-body">${escapeHtml(latestBlogPost.description)}</p>
            <p class="blog-meta">${blogDateFormatted}</p>
          </a>`
    : `<a class="dev-blog" href="/pathogen/blog">
            <p class="blog-eyebrow">From the blog</p>
            <h3 class="blog-title">Read the latest posts.</h3>
            <p class="blog-body">Tutorials, deep-dives, and language-design notes from the Pathogen team.</p>
          </a>`;

  const githubIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
  const cliIcon = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-436H140v436Zm160-72-42-42 103-104-104-104 43-42 146 146-146 146Z"/></svg>`;
  const editorIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.45 1.97l-4.83-2.34a1.5 1.5 0 0 0-1.7.3L1.59 13.07a1 1 0 0 0 0 1.42l1.32 1.32a1 1 0 0 0 1.42 0L20.2 4.86l1.95.93a1.5 1.5 0 0 0 2.13-1.36V3.33a1.5 1.5 0 0 0-.83-1.36z"/></svg>`;
  const arrowIcon = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z"/></svg>`;

  // 6-petal hero render — matches the Pathogen snippet to the left.
  const heroSvg = `<svg viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="80" cy="0" r="18" fill="oklch(72% 0.18 0)"/>
              <circle cx="40" cy="-69.28" r="18" fill="oklch(72% 0.18 60)"/>
              <circle cx="-40" cy="-69.28" r="18" fill="oklch(72% 0.18 120)"/>
              <circle cx="-80" cy="0" r="18" fill="oklch(72% 0.18 180)"/>
              <circle cx="-40" cy="69.28" r="18" fill="oklch(72% 0.18 240)"/>
              <circle cx="40" cy="69.28" r="18" fill="oklch(72% 0.18 300)"/>
              <circle cx="0" cy="0" r="3" fill="var(--text-tertiary)"/>
            </svg>`;

  const codeSnippet = `<span class="line"><span class="cm">// petals around a circle</span></span><span class="line"><span class="kw">let</span> r <span class="pun">=</span> <span class="num">80</span><span class="pun">;</span></span><span class="line"><span class="kw">for</span> i <span class="kw">in</span> <span class="num">0</span><span class="pun">..</span><span class="num">6</span> <span class="pun">{</span></span><span class="line">  <span class="fn">circle</span><span class="pun">(</span>r <span class="pun">*</span> <span class="fn">cos</span><span class="pun">(</span>i <span class="pun">*</span> <span class="num">60°</span><span class="pun">),</span></span><span class="line">         r <span class="pun">*</span> <span class="fn">sin</span><span class="pun">(</span>i <span class="pun">*</span> <span class="num">60°</span><span class="pun">),</span> <span class="num">18</span><span class="pun">)</span></span><span class="line">    <span class="pun">.</span><span class="fn">fill</span><span class="pun">(</span><span class="fn">oklch</span><span class="pun">(</span><span class="num">72%</span> <span class="num">0.18</span> <span class="str">\${i * 60}</span><span class="pun">));</span></span><span class="line"><span class="pun">}</span></span>`;

  const content = `
    <div class="homepage">
      <section class="dev-hero">
        <div class="dev-hero-text">
          <p class="hero-eyebrow">SVG-Path-Extended · v1.0</p>
          <h1>From a one-liner to a thousand-line <em>composition.</em></h1>
          <p class="lede">Pathogen Studio is a typed, expression-first language for SVG paths. Compile from the CLI, the playground, or your editor — get the same path output every time.</p>
          <div class="dev-cta-cluster">
            <a class="cta-primary" href="/pathogen/workspace/new">
              <span>Create new workspace</span>
              ${arrowIcon}
            </a>
            <a class="cta-mono" href="https://www.npmjs.com/package/svg-path-extended" target="_blank" rel="noopener">$ npm install svg-path-extended</a>
          </div>
        </div>

        <div class="dev-editor">
          <pre class="dev-code">${codeSnippet}</pre>
          <div class="dev-render">
            ${heroSvg}
            <span class="dev-render-caption">→ 6 paths · 0.04s</span>
          </div>
        </div>
      </section>

      <section class="dev-toolset">
        <a class="dev-tool" href="https://github.com/ryankuykendall/svg-path-extended" target="_blank" rel="noopener">
          <p class="tool-eyebrow">${githubIcon}<span>Source · MIT</span></p>
          <h3 class="tool-title">GitHub.</h3>
          <p class="tool-body">Read the source, file an issue, send a pull request. Compiler, evaluator, stdlib, CLI — all in one repository.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">git clone</span> ryankuykendall/svg-path-extended</div>
        </a>

        <a class="dev-tool" href="https://www.npmjs.com/package/svg-path-extended" target="_blank" rel="noopener">
          <p class="tool-eyebrow">${cliIcon}<span>CLI · Node</span></p>
          <h3 class="tool-title">Compile anywhere.</h3>
          <p class="tool-body">Pipe stdin, eval inline, or compile a file. Output as a path string, a full SVG, or an annotated debug view.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">npm install</span> -g svg-path-extended</div>
        </a>

        <a class="dev-tool" href="/pathogen/blog/vscode-developer-experience">
          <p class="tool-eyebrow">${editorIcon}<span>VS Code · Coming soon</span></p>
          <h3 class="tool-title">In the editor.</h3>
          <p class="tool-body">LSP-powered completions, hover docs, diagnostics, and a live preview pane — install the extension when it lands and write Pathogen anywhere you write code.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">code --install-extension</span> pathogen-language</div>
        </a>
      </section>

      <section class="dev-bottom">
        ${blogCardHtml}

        <div class="dev-showcase">
          ${showcaseTilesHtml}
        </div>
      </section>

      <footer class="dev-footer">
        <span>built on svg-path-extended v1.0</span>
        <span>
          <a href="https://github.com/ryankuykendall/svg-path-extended" target="_blank" rel="noopener">github</a> ·
          <a href="/pathogen/docs">docs</a> ·
          <a href="/pathogen/blog">blog</a> ·
          <a href="/pathogen/explore">explore</a>
        </span>
      </footer>
    </div>
  `;

  const headExtra = `<link rel="stylesheet" href="/pathogen/styles/homepage.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Pathogen Studio",
    "description": "A typed, expression-first language for SVG paths. CLI, playground, and editor integration powered by svg-path-extended.",
    "url": "https://pathogen.studio/pathogen/",
    "publisher": { "@type": "Organization", "name": "Pedestal Design", "url": "https://pathogen.studio" }
  }
  </script>`;

  const html = renderPage({
    title: '',
    description:
      'Pathogen Studio — a typed, expression-first language for SVG paths. CLI, playground, and editor integration powered by svg-path-extended.',
    path: '/pathogen/',
    content,
    headExtra,
    currentUser,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, max-age=30',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // /pathogen/api/* used to be served here — moved to the dedicated
    // pathogen-api Worker at api.pathogen.studio. Any lingering callers
    // (cached SPA bundles, scripted clients) get a 410 with a hint to
    // re-bundle, instead of falling through to the SPA shell.
    if (path.startsWith('/pathogen/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Moved Permanently',
          message: 'API endpoints now live at https://api.pathogen.studio. Reload the SPA to pick up the new bundle.',
        }),
        {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Marketing homepage at /pathogen/ and /pathogen/index.html — server-rendered
    // for both signed-out and signed-in visitors. Must claim these URLs before
    // the SPA fallback at the bottom of this handler so the SPA shell never
    // loads at the root.
    if (path === '/pathogen/' || path === '/pathogen/index.html') {
      return renderHomepage(request, env, url);
    }

    // SEO routes — served before the SPA catch-all
    if (path === '/pathogen/docs' || path === '/pathogen/docs/') {
      url.pathname = '/pathogen/docs/index.html';
      return env.ASSETS.fetch(url.toString());
    }
    if (path === '/pathogen/explore') {
      return renderExplorePage(request, env, url);
    }
    if (path === '/pathogen/featured') {
      return renderFeaturedPage(request, env, url);
    }
    const profilePathMatch = path.match(/^\/pathogen\/u\/([a-z0-9-]+)$/);
    if (profilePathMatch) {
      return renderProfilePage(request, env, url, profilePathMatch[1]);
    }

    // Blog SEO routes
    if (path === '/pathogen/blog' || path === '/pathogen/blog/') {
      url.pathname = '/pathogen/blog/index.html';
      return env.ASSETS.fetch(url.toString());
    }
    // Individual blog posts — check if static file exists
    const blogPostMatch = path.match(/^\/pathogen\/blog\/([a-z0-9-]+)$/);
    if (blogPostMatch) {
      url.pathname = `/pathogen/blog/${blogPostMatch[1]}.html`;
      return env.ASSETS.fetch(url.toString());
    }

    // SPA routes under /pathogen/ that don't have file extensions
    if (path.startsWith('/pathogen/') && path !== '/pathogen/' && !/\.\w+$/.test(path)) {
      // Serve the SPA index.html
      url.pathname = '/pathogen/index.html';
      return env.ASSETS.fetch(url.toString());
    }

    // For everything else, serve normally
    return env.ASSETS.fetch(request);
  },
};
