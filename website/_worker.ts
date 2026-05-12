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
import { PATHOGEN_VERSION } from '../playground/utils/version.js';

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
    'A visual playground for pathogen-lang — variables, expressions, control flow, functions, and more for SVG paths.';
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
  <link rel="stylesheet" href="/styles/theme.css">
  <link rel="stylesheet" href="/styles/site-header.css">
  <script>
    // Flash prevention — apply saved theme before paint
    (function(){var t=localStorage.getItem('pathogen-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-active-theme',t)}else{document.documentElement.setAttribute('data-active-theme',window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}})();
  </script>
  ${ssrUserScript}
  ${headExtra}
  <style>
    /* body styles (font-family, background, atmospheric grain) are defined
     * globally in /styles/theme.css. */

    /* Site header is shared via /styles/site-header.css */
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
  <script src="/components/shared/theme-toggle.js" type="module"></script>
  <script src="/components/shared/account-menu.js" type="module"></script>
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
        const href = `/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
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
    if (page > 1) links.push(`<a class="page-link" href="/explore?page=${page - 1}">&larr; Previous</a>`);
    links.push(`<span class="page-info">Page ${page} of ${totalPages}</span>`);
    if (page < totalPages) links.push(`<a class="page-link" href="/explore?page=${page + 1}">Next &rarr;</a>`);
    paginationHtml = `<div class="pagination">${links.join('')}</div>`;
  }

  const content = `
    <h1>Explore Public Workspaces</h1>
    <p class="explore-subtitle">Discover what others are creating with pathogen-lang</p>
    ${cardsHtml}
    ${paginationHtml}
  `;

  const headExtra = `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Explore Public Workspaces",
    "description": "Browse public workspaces created with pathogen-lang",
    "url": "https://pathogen.studio/explore",
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
    description: 'Browse public workspaces created with pathogen-lang',
    path: '/explore',
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
      content: `<h1>Profile not found</h1><p>No user with handle <code>${escapeHtml(handle)}</code>.</p><p><a href="/explore">Browse public workspaces &rarr;</a></p>`,
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
        const href = `/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
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
        const href = `/workspace/${ws.slug ? ws.slug + '--' + ws.id : ws.id}`;
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
    <p class="featured-subtitle">Hand-picked examples showcasing what's possible with pathogen-lang</p>
    ${cardsHtml}
  `;

  const headExtra = `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Featured Workspaces",
    "description": "Hand-picked pathogen-lang workspace showcases",
    "url": "https://pathogen.studio/featured",
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
    description: 'Hand-picked pathogen-lang workspace showcases',
    path: '/featured',
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
    src: '/blog/samples/post1/linear-basics.svg',
    alt: 'Linear and radial gradients composed into a layered landscape',
  },
  {
    slug: 'gradient-conic',
    label: 'Conic Gradient',
    src: '/blog/samples/post2/color-wheel.svg',
    alt: 'Conic gradient color wheel rendered via WebGPU',
  },
  {
    slug: 'gradient-mesh-freeform',
    label: 'Mesh Gradient',
    src: '/blog/samples/post3/mesh-basics.svg',
    alt: '2x2 mesh gradient with bilinear OKLCH interpolation',
  },
  {
    slug: 'pathblock-parametric-sampling',
    label: 'Parametric Sampling',
    src: '/blog/samples/post7/sampling-anatomy.svg',
    alt: 'PathBlock parametric sampling — get(), tangent(), and normal() at t = 0.4',
  },
  {
    slug: 'grid-functions',
    label: 'Grids',
    src: '/blog/samples/post15/square-grid-patterns.svg',
    alt: 'Procedural square grid patterns',
  },
  {
    slug: 'heading-turn',
    label: 'Tangents',
    src: '/blog/samples/post14/heading-turn-demo.svg',
    alt: 'Tangent control curves — C, S, zigzag, and spiral',
  },
];

async function renderHomepage(request: Request, env: Env, _url: URL): Promise<Response> {
  const currentUser = await getSsrUser(request, env);

  const showcaseTilesHtml = HOMEPAGE_SHOWCASE_TILES.map(
    (tile) =>
      `<a class="dev-tile" href="/blog/${tile.slug}">
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
    ? `<a class="dev-blog" href="/blog/${latestBlogPost.slug}">
            <p class="blog-eyebrow">From the blog · Latest</p>
            <h3 class="blog-title">${escapeHtml(latestBlogPost.title)}</h3>
            <p class="blog-body">${escapeHtml(latestBlogPost.description)}</p>
            <p class="blog-meta">${blogDateFormatted}</p>
          </a>`
    : `<a class="dev-blog" href="/blog">
            <p class="blog-eyebrow">From the blog</p>
            <h3 class="blog-title">Read the latest posts.</h3>
            <p class="blog-body">Tutorials, deep-dives, and language-design notes from the Pathogen team.</p>
          </a>`;

  const githubIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
  const cliIcon = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-436H140v436Zm160-72-42-42 103-104-104-104 43-42 146 146-146 146Z"/></svg>`;
  const editorIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.45 1.97l-4.83-2.34a1.5 1.5 0 0 0-1.7.3L1.59 13.07a1 1 0 0 0 0 1.42l1.32 1.32a1 1 0 0 0 1.42 0L20.2 4.86l1.95.93a1.5 1.5 0 0 0 2.13-1.36V3.33a1.5 1.5 0 0 0-.83-1.36z"/></svg>`;
  const arrowIcon = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z"/></svg>`;

  // 29-petal hero render — actual compiled SVG from the Pathogen snippet to the left.
  const heroSvg = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path data-layer-name="layer-0" id="layer-0" d="M 270 200 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff8cff" stroke="#e346db" stroke-width="4"/>
              <path data-layer-name="layer-1" id="layer-1" d="M 267.19 225.80 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff8dff" stroke="#e947d4" stroke-width="4"/>
              <path data-layer-name="layer-2" id="layer-2" d="M 258.91 250.39 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff8eff" stroke="#ee48cc" stroke-width="4"/>
              <path data-layer-name="layer-3" id="layer-3" d="M 245.53 272.62 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff8fff" stroke="#f349c4" stroke-width="4"/>
              <path data-layer-name="layer-4" id="layer-4" d="M 227.69 291.46 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff90fe" stroke="#f84bbc" stroke-width="4"/>
              <path data-layer-name="layer-5" id="layer-5" d="M 206.21 306.02 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff92f6" stroke="#fd4db5" stroke-width="4"/>
              <path data-layer-name="layer-6" id="layer-6" d="M 182.10 315.63 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff94ee" stroke="#ff4fad" stroke-width="4"/>
              <path data-layer-name="layer-7" id="layer-7" d="M 156.50 319.82 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff96e5" stroke="#ff51a5" stroke-width="4"/>
              <path data-layer-name="layer-8" id="layer-8" d="M 130.59 318.42 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff99dd" stroke="#ff549d" stroke-width="4"/>
              <path data-layer-name="layer-9" id="layer-9" d="M 105.58 311.48 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff9cd5" stroke="#ff5796" stroke-width="4"/>
              <path data-layer-name="layer-10" id="layer-10" d="M 82.66 299.32 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ff9fcd" stroke="#ff5a8e" stroke-width="4"/>
              <path data-layer-name="layer-11" id="layer-11" d="M 62.88 282.52 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffa2c5" stroke="#ff5e87" stroke-width="4"/>
              <path data-layer-name="layer-12" id="layer-12" d="M 47.18 261.87 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffa6bd" stroke="#ff627f" stroke-width="4"/>
              <path data-layer-name="layer-13" id="layer-13" d="M 36.28 238.32 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffaab6" stroke="#ff6678" stroke-width="4"/>
              <path data-layer-name="layer-14" id="layer-14" d="M 30.70 212.97 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffaeae" stroke="#ff6b70" stroke-width="4"/>
              <path data-layer-name="layer-15" id="layer-15" d="M 30.70 187.03 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffb2a8" stroke="#ff6f69" stroke-width="4"/>
              <path data-layer-name="layer-16" id="layer-16" d="M 36.28 161.68 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffb7a1" stroke="#ff7462" stroke-width="4"/>
              <path data-layer-name="layer-17" id="layer-17" d="M 47.18 138.13 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffbb9b" stroke="#ff795b" stroke-width="4"/>
              <path data-layer-name="layer-18" id="layer-18" d="M 62.88 117.48 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffc095" stroke="#ff7e55" stroke-width="4"/>
              <path data-layer-name="layer-19" id="layer-19" d="M 82.66 100.68 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffc590" stroke="#ff834e" stroke-width="4"/>
              <path data-layer-name="layer-20" id="layer-20" d="M 105.58 88.52 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffca8b" stroke="#ff8848" stroke-width="4"/>
              <path data-layer-name="layer-21" id="layer-21" d="M 130.59 81.58 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffcf87" stroke="#ff8d42" stroke-width="4"/>
              <path data-layer-name="layer-22" id="layer-22" d="M 156.50 80.18 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffd484" stroke="#ff923d" stroke-width="4"/>
              <path data-layer-name="layer-23" id="layer-23" d="M 182.10 84.37 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffd981" stroke="#ff9739" stroke-width="4"/>
              <path data-layer-name="layer-24" id="layer-24" d="M 206.21 93.98 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffde7f" stroke="#ff9c36" stroke-width="4"/>
              <path data-layer-name="layer-25" id="layer-25" d="M 227.69 108.54 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffe37e" stroke="#ffa134" stroke-width="4"/>
              <path data-layer-name="layer-26" id="layer-26" d="M 245.53 127.38 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffe77d" stroke="#ffa633" stroke-width="4"/>
              <path data-layer-name="layer-27" id="layer-27" d="M 258.91 149.61 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffea7c" stroke="#ffab34" stroke-width="4"/>
              <path data-layer-name="layer-28" id="layer-28" d="M 267.19 174.20 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" fill="#ffed7c" stroke="#ffb036" stroke-width="4"/>
            </svg>`;

  const codeSnippet = `<span class="line"><span class="kw">let</span> colors <span class="pun">=</span> Color<span class="pun">.</span><span class="fn">palette</span><span class="pun">(</span><span class="fn">oklch</span><span class="pun">(</span><span class="num">0.6695</span> <span class="num">0.2483</span> <span class="num">330.1</span><span class="pun">),</span></span><span class="line">                           <span class="fn">oklch</span><span class="pun">(</span><span class="num">0.8142</span> <span class="num">0.1571</span> <span class="num">72.9</span><span class="pun">),</span></span><span class="line">                           <span class="num">29</span><span class="pun">);</span></span><span class="line"><span class="kw">let</span> center <span class="pun">=</span> <span class="fn">Point</span><span class="pun">(</span><span class="num">200</span><span class="pun">,</span> <span class="num">200</span><span class="pun">);</span></span><span class="line"><span class="kw">for</span> <span class="pun">([</span>color<span class="pun">,</span> index<span class="pun">]</span> <span class="kw">in</span> colors<span class="pun">) {</span></span><span class="line">  <span class="kw">let</span> petalLayer <span class="pun">=</span> <span class="fn">PathLayer</span><span class="pun">(</span><span class="str">\`layer-\${index}\`</span><span class="pun">)</span> <span class="pun">\${</span></span><span class="line">    fill<span class="pun">:</span> color<span class="pun">.</span><span class="fn">lighten</span><span class="pun">(</span><span class="num">20%</span><span class="pun">);</span></span><span class="line">    stroke<span class="pun">:</span> color<span class="pun">;</span></span><span class="line">    stroke-width<span class="pun">:</span> <span class="num">4</span><span class="pun">;</span></span><span class="line">  <span class="pun">};</span></span><span class="line">  petalLayer<span class="pun">.</span><span class="fn">apply</span> <span class="pun">{</span></span><span class="line">    <span class="kw">let</span> petalCenter <span class="pun">=</span> center<span class="pun">.</span><span class="fn">polarTranslate</span><span class="pun">(</span><span class="fn">calc</span><span class="pun">(</span><span class="num">2pi</span> <span class="pun">*</span> <span class="pun">(</span>index <span class="pun">/</span> colors<span class="pun">.</span>length<span class="pun">)),</span> <span class="num">120</span><span class="pun">);</span></span><span class="line">    <span class="fn">circle</span><span class="pun">(</span>petalCenter<span class="pun">.</span>x<span class="pun">,</span> petalCenter<span class="pun">.</span>y<span class="pun">,</span> <span class="num">50</span><span class="pun">);</span></span><span class="line">  <span class="pun">}</span></span><span class="line"><span class="pun">}</span></span>`;

  const content = `
    <div class="homepage">
      <section class="dev-hero">
        <div class="dev-hero-text">
          <p class="hero-eyebrow">
            <span>pathogen-lang · v${PATHOGEN_VERSION}</span>
            <span class="hero-nav-strip" aria-label="Site sections">
              <a href="/blog">Blog</a>
              <a href="/docs">Docs</a>
              <a href="/explore">Explore</a>
              <a href="/featured">Featured</a>
            </span>
          </p>
          <h1>From a one-liner to a thousand-line <em>composition.</em></h1>
          <p class="lede">Pathogen Studio is a typed, expression-first language for SVG paths. Compile from the CLI, the playground, or your editor — get the same path output every time.</p>
          <div class="dev-cta-cluster">
            <a class="cta-primary" href="/workspace/new">
              <span>Create new workspace</span>
              ${arrowIcon}
            </a>
            <a class="cta-mono" href="https://www.npmjs.com/package/pathogen-lang" target="_blank" rel="noopener">$ npm install pathogen-lang</a>
          </div>
        </div>
      </section>

      <section class="dev-editor-row">
        <div class="dev-editor">
          <pre class="dev-code">${codeSnippet}</pre>
          <div class="dev-render">
            ${heroSvg}
            <span class="dev-render-caption">→ 29 paths · 0.04s</span>
          </div>
        </div>
      </section>

      <section class="dev-toolset">
        <a class="dev-tool" href="https://github.com/ryankuykendall/pathogen-lang" target="_blank" rel="noopener">
          <p class="tool-eyebrow">${githubIcon}<span>Source · MIT</span></p>
          <h3 class="tool-title">GitHub.</h3>
          <p class="tool-body">Read the source, file an issue, send a pull request. Compiler, evaluator, stdlib, CLI — all in one repository.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">git clone</span> ryankuykendall/pathogen-lang</div>
        </a>

        <a class="dev-tool" href="https://www.npmjs.com/package/pathogen-lang" target="_blank" rel="noopener">
          <p class="tool-eyebrow">${cliIcon}<span>CLI · Node</span></p>
          <h3 class="tool-title">Compile anywhere.</h3>
          <p class="tool-body">Pipe stdin, eval inline, or compile a file. Output as a path string, a full SVG, or an annotated debug view.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">npm install</span> -g pathogen-lang</div>
        </a>

        <a class="dev-tool" href="/blog/vscode-developer-experience">
          <p class="tool-eyebrow">${editorIcon}<span>VS Code · Coming soon</span></p>
          <h3 class="tool-title">In the editor.</h3>
          <p class="tool-body">LSP-powered completions, hover docs, diagnostics, and a live preview pane — install the extension when it lands and write Pathogen anywhere you write code.</p>
          <div class="tool-cmd"><span class="prompt">$</span> <span class="cmd">code --install-extension</span> pedestal-design.pathogen-lang</div>
        </a>
      </section>

      <section class="dev-bottom">
        ${blogCardHtml}

        <div class="dev-showcase">
          ${showcaseTilesHtml}
        </div>
      </section>

      <footer class="dev-footer">
        <span>built on Pathogen v${PATHOGEN_VERSION}</span>
        <span>
          <a href="https://github.com/ryankuykendall/pathogen-lang" target="_blank" rel="noopener">github</a> ·
          <a href="/docs">docs</a> ·
          <a href="/blog">blog</a> ·
          <a href="/explore">explore</a>
        </span>
      </footer>
    </div>
  `;

  const headExtra = `<link rel="stylesheet" href="/styles/homepage.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Pathogen Studio",
    "description": "A typed, expression-first language for SVG paths. CLI, playground, and editor integration powered by pathogen-lang.",
    "url": "https://pathogen.studio/",
    "publisher": { "@type": "Organization", "name": "Pedestal Design", "url": "https://pathogen.studio" }
  }
  </script>`;

  const html = renderPage({
    title: '',
    description:
      'Pathogen Studio — a typed, expression-first language for SVG paths. CLI, playground, and editor integration powered by pathogen-lang.',
    path: '/',
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

    // Backward-compat: the site used to live under /pathogen/* (when it was
    // a sub-app at pedestal.design/pathogen/...). Anyone hitting an old URL
    // gets a 301 to the prefix-less location. Preserves search params.
    if (path === '/pathogen' || path.startsWith('/pathogen/')) {
      const newPath = path.replace(/^\/pathogen/, '') || '/';
      return Response.redirect(`${url.origin}${newPath}${url.search}`, 301);
    }

    // Marketing homepage at the apex — server-rendered for every visitor.
    // Must claim / and /index.html before the SPA fallback so the static
    // SPA shell never loads at the root.
    if (path === '/' || path === '/index.html') {
      return renderHomepage(request, env, url);
    }

    // SEO routes — served before the SPA catch-all.
    if (path === '/docs' || path === '/docs/') {
      url.pathname = '/docs/index.html';
      return env.ASSETS.fetch(url.toString());
    }
    if (path === '/explore') {
      return renderExplorePage(request, env, url);
    }
    if (path === '/featured') {
      return renderFeaturedPage(request, env, url);
    }
    const profilePathMatch = path.match(/^\/u\/([a-z0-9-]+)$/);
    if (profilePathMatch) {
      return renderProfilePage(request, env, url, profilePathMatch[1]);
    }

    // Blog SEO routes
    if (path === '/blog' || path === '/blog/') {
      url.pathname = '/blog/index.html';
      return env.ASSETS.fetch(url.toString());
    }
    const blogPostMatch = path.match(/^\/blog\/([a-z0-9-]+)$/);
    if (blogPostMatch) {
      url.pathname = `/blog/${blogPostMatch[1]}.html`;
      return env.ASSETS.fetch(url.toString());
    }

    // SPA fallback — extensionless paths that didn't match a SEO route get
    // the SPA shell. The shell file lives at /spa.html so it doesn't
    // collide with the SSR-rendered apex (/index.html → renderHomepage).
    if (!/\.\w+$/.test(path)) {
      url.pathname = '/spa.html';
      return env.ASSETS.fetch(url.toString());
    }

    // For everything else (extension-bearing paths: assets, JS, CSS,
    // images, favicons, etc.), serve normally.
    return env.ASSETS.fetch(request);
  },
};
