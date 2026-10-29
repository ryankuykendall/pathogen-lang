---
title: "Adding SEO Pages to a CloudFlare Pages SPA: The Routing Sequel"
date: "2026-02-17"
slug: "seo-pages-cloudflare-workers-routing"
description: "After solving SPA routing on CloudFlare Pages, we needed to add server-rendered and static pages alongside the SPA. New platform, new surprises — 308 redirects, stale workers, build pipeline ordering, and the art of making static and dynamic content coexist."
---

# Adding SEO Pages to a CloudFlare Pages SPA: The Routing Sequel

## The Goal

After getting our SPA working on CloudFlare Pages (a saga documented in [the first post](/pathogen/blog/cloudflare-pages-spa-routing-struggle)), we had a new problem: search engines couldn't see any of our content. The SPA renders everything client-side with Web Components and Shadow DOM. Googlebot sees an empty shell. Docs, workspace galleries, curated showcases — all invisible to crawlers.

The plan was straightforward: add three SEO-friendly pages that render real HTML.

1. **Docs** — static HTML generated at build time, served from the filesystem
2. **Explore** — a paginated grid of public workspaces, rendered by the worker at request time
3. **Featured** — an admin-curated showcase, also worker-rendered

All three would share navigation look-and-feel with the SPA. Users clicking between them and the SPA should feel like they're on one coherent site.

We already had `_worker.js` handling SPA routing. Extending it to serve SEO pages seemed like it would be the easy part. It was not.

## The Architecture

The routing hierarchy we needed was simple:

```text
/pathogen/api/*         → API handlers (existing)
/pathogen/docs          → static HTML file
/pathogen/explore       → worker-rendered HTML
/pathogen/featured      → worker-rendered HTML
/pathogen/* (no ext)    → SPA index.html (existing)
everything else         → static assets (existing)
```

Worker-rendered pages were easy — the worker already intercepts all requests, so adding `renderExplorePage()` and `renderFeaturedPage()` functions was just a matter of checking the path and returning a `new Response()` with HTML content. No platform surprises there.

The static docs page, however, introduced a cascade of platform behaviors we didn't expect.

## Surprise 1: The 308 Redirect Phantom

We generated a complete HTML page at `public/pathogen/docs/index.html` during the build. The plan was simple: when the worker sees `/pathogen/docs`, use `env.ASSETS.fetch()` to serve the static file.

```javascript
if (path === '/pathogen/docs' || path === '/pathogen/docs/') {
  url.pathname = '/pathogen/docs/index.html';
  return env.ASSETS.fetch(url.toString());
}
```

Testing locally with `curl`, we got back 1,234 bytes — far too small for our 160KB docs page. That's the SPA's `index.html`. Our route wasn't matching.

More investigation revealed something unexpected: requesting `/pathogen/docs/index.html` directly returned a **308 Permanent Redirect** to `/pathogen/docs/`. CloudFlare Pages automatically strips `.html` extensions and trailing `/index` from URLs, issuing 308 redirects. This is the platform's "pretty URLs" feature, and it runs at the static asset layer — potentially before or alongside the worker.

Here's what's confusing: this behavior doesn't affect our worker route. The worker intercepts `/pathogen/docs` before the static asset layer gets involved. The 308 exists if someone visits `/pathogen/docs/index.html` directly, but our worker code never does — it catches the clean URL first. So the 308 was a red herring. But we spent considerable time investigating it because it seemed like it could explain why the wrong content was being served.

The actual problem was something else entirely.

## Surprise 2: The Zombie Worker Strikes Again

After adding the SEO routes, rebuilding the site, and restarting the dev server, our new routes still returned the SPA. Every request to `/pathogen/docs` showed "My Workspaces" — the SPA landing page.

If this sounds familiar, it should. We documented the exact same problem in our [first CloudFlare Pages blog post](/pathogen/blog/cloudflare-pages-spa-routing-struggle). The `wrangler pages dev` command spawns a `workerd` subprocess that can survive the parent process being killed. When you restart `wrangler`, it may start a fresh process while the old one keeps running on the same port — or the old one keeps answering requests while the new one fails to bind.

The fix was the same as before: stop the dev server, verify no orphaned `workerd` processes are running, and restart cleanly. After that, all three SEO routes served the correct content.

This is now a pattern. Every time we make significant changes to `_worker.js`, we have to be paranoid about stale processes. The platform doesn't warn you. The old code just keeps running while you stare at your changes wondering why they don't work.

## Surprise 3: The Build Pipeline Race

Our build pipeline runs in stages:

```text
npm run build           → compile the library
npm run build:docs      → generate static docs HTML
npm run build:blog      → generate blog content module
tsx build-website.ts    → assemble everything into public/
```

The docs build generates `website/docs-static/index.html` — a complete HTML page with sidebar navigation, syntax highlighting, and progressive enhancement scripts. The website build then copies it to `public/pathogen/docs/index.html`.

But here's the trap: `build-website.ts` starts by wiping the entire `public/` directory. If the docs build wrote directly to `public/pathogen/docs/`, those files would be deleted moments later when the website build started.

We initially made this mistake. The docs page generated beautifully, the website build completed successfully, but the docs page was gone — replaced by a clean copy of the SPA without the static docs.

The fix was an intermediate output directory. The docs build writes to `website/docs-static/`, which the website build copies into `public/pathogen/docs/` after the clean step. Simple, but the kind of issue that's invisible when each build step works correctly in isolation.

This isn't a CloudFlare-specific problem, but it's the kind of subtle ordering bug that emerges when you're juggling static generation, worker rendering, and SPA routing in a single deployment.

## Surprise 4: Static Assets and Worker Priority

CloudFlare Pages has an implicit priority order: static assets are served first, and the worker handles everything else. This means if you have a file at `public/pathogen/docs/index.html`, the platform might serve it before your worker even runs.

In practice, this worked in our favor for the docs page — but it also meant we needed to be deliberate about which routes are handled by the worker versus served as static assets. For `/pathogen/docs`, the worker explicitly hands off to the static asset layer via `env.ASSETS.fetch()`. For `/pathogen/explore` and `/pathogen/featured`, the worker generates HTML on the fly.

The mental model you need: the worker is a middleware layer, and `env.ASSETS.fetch()` is how you call "next" to let the static asset layer handle a request. If you don't call it, the worker is the end of the line.

What the documentation doesn't make clear is the interaction between the worker, the static asset layer, and the 308 redirect behavior. All three are happening, and understanding which runs when requires experimentation rather than documentation.

## The Navigation Consistency Problem

With three rendering modes — SPA (client-side), static (build-time), and worker (request-time) — keeping navigation consistent is harder than it sounds.

The SPA uses a `<app-header>` Web Component with Shadow DOM. The static docs page and worker-rendered pages use plain HTML. They need to look identical: same 56px height, same logo, same nav links, same hover states, same theme toggle.

Our first pass duplicated the nav bar CSS and HTML across all three rendering contexts. This immediately created a problem: the SPA had a theme toggle and Preferences link that the SEO pages didn't. Clicking from Docs to Workspaces, the nav bar would gain two elements. Clicking back, they'd disappear. The effect was jarring — the navigation felt broken even though every page was technically correct in isolation.

The fix had two parts. First, we extracted the theme toggle into a standalone Web Component (`<theme-toggle>`) that works in any context — SPA or static HTML. It reads and writes the same `localStorage` key, dispatches the same events, and needs no framework or imports. Adding it to SEO pages is just a `<script type="module">` tag and a `<theme-toggle>` element in the header.

Second, we added the Preferences link to every page's navigation — SEO pages included. Even though Preferences is an SPA route, linking to it from static pages works via a full page load. The important thing is that every nav bar has the same links in the same order.

## Flash of Wrong Theme

Static HTML pages have a subtlety that SPAs handle automatically: the theme. Our SPA initializes the theme manager before any rendering occurs, so the user never sees a flash of the wrong color scheme. Static pages, however, start rendering immediately — before any JavaScript runs.

If a user has dark mode saved in `localStorage` but the page's HTML defaults to light, they'll see a brief flash of light theme before the JS kicks in and switches to dark. The fix is a tiny inline `<script>` in the `<head>` — before the CSS even loads:

```javascript
(function(){
  var t = localStorage.getItem('pathogen-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
})();
```

This runs synchronously, blocking the parser for microseconds while it sets the theme attribute. By the time the browser processes the `<link rel="stylesheet">` for `theme.css`, the correct custom properties are already active. No flash.

## The `robots.txt` and `sitemap.xml` Dance

We also needed to tell search engines about the new pages. This meant generating `robots.txt` (allow these paths, disallow those) and `sitemap.xml` (here are all the URLs we want indexed).

The sitemap needed to be dynamic — blog posts are added as markdown files, and the build should discover them automatically. We enumerate `website/blog/*.md`, strip the extension to get slugs, and generate `<url>` entries for each.

One oversight: we initially forgot to include `/pathogen/blog` in both `robots.txt` and `sitemap.xml`. The blog pages were already crawlable via the SPA's static rendering, but without being listed in robots.txt and the sitemap, search engines had no way to discover them efficiently. A small thing, but the kind of omission that undermines the entire SEO effort.

## Lessons Learned

### 1. Always restart `wrangler` cleanly

Kill orphaned `workerd` processes. Always. Check `ps aux | grep workerd` after stopping the dev server. This is the single most time-wasting gotcha in CloudFlare Pages development. Until CloudFlare fixes the process management, treat every restart as potentially stale.

### 2. Build pipeline ordering matters

If one build step cleans an output directory and another writes to it, they need to run in the right order with an intermediate staging area. This is Build Systems 101, but it's easy to overlook when you're adding features incrementally and each step works in isolation.

### 3. Navigation consistency beats navigation logic

When you have multiple rendering modes, every page should show the same navigation — same links, same order, same interactive elements. It's tempting to hide links that "don't apply" on certain pages. Don't. Users perceive the nav bar as a constant. When it changes between pages, the site feels broken.

### 4. Theme flash prevention needs to be in `<head>`

Any page that supports user-selected themes needs an inline script in `<head>` that runs before the stylesheet loads. This is well-known in the SSR world but easy to forget when you're adding static pages to an existing SPA.

### 5. Standalone Web Components bridge the gap

When you need UI elements that work identically across SPA and static contexts, standalone Web Components — no imports, no framework, self-registering — are the right abstraction. Our `<theme-toggle>` works everywhere because it depends on nothing except the DOM and `localStorage`.

## Conclusion

Adding SEO-friendly pages to a CloudFlare Pages SPA is achievable, but the platform makes you earn it. The documentation doesn't cover the interaction between workers, static assets, and automatic redirects. The dev server's process management will waste your time. And the challenge of maintaining visual consistency across rendering modes is a design problem that no platform can solve for you.

The final architecture — static HTML for docs, worker-rendered HTML for dynamic pages, SPA for interactive features, all sharing a common nav bar and theme system — works well. Getting there required more debugging than coding. As with our first CloudFlare Pages adventure, the platform is powerful enough to do everything we need. The documentation just hasn't caught up with the use cases yet.
