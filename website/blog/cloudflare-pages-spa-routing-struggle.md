---
title: "The CloudFlare Pages SPA Routing Odyssey"
date: "2026-01-28"
slug: "cloudflare-pages-spa-routing-struggle"
description: "A developer's journey through documentation gaps when trying to make SPA routing work on CloudFlare Pages with subdirectory deployments."
---

# The CloudFlare Pages SPA Routing Odyssey: A Developer's Journey Through Documentation Gaps

## The Problem

What should have been a simple task—making a Single Page Application work with direct URL navigation on CloudFlare Pages—turned into a multi-hour debugging session that exposed significant gaps in CloudFlare's documentation and inconsistencies between their local development tools and production behavior.

The issue was straightforward: our SPA lived at `/svg-path-extended/` with client-side routes like `/svg-path-extended/docs`, `/svg-path-extended/preferences`, and `/svg-path-extended/workspace/new`. Navigating to these routes from within the app worked fine. But typing a URL directly into the browser or refreshing the page? That's where things fell apart.

- **Locally with `wrangler pages dev`**: Routes returned 404 errors or 307/308 redirects to the base path
- **On CloudFlare Pages production**: Routes redirected to `/svg-path-extended/` instead of serving the SPA

Both behaviors meant the same thing: the SPA's client-side router never got a chance to handle the URL.

## The First Attempt: `_redirects` File

CloudFlare Pages documentation prominently features the `_redirects` file as the solution for SPA routing. The syntax seems simple enough:

```text
/svg-path-extended/docs  /svg-path-extended/index.html  200
/svg-path-extended/preferences  /svg-path-extended/index.html  200
/svg-path-extended/*  /svg-path-extended/index.html  200
```

The `200` status code is supposed to perform a "rewrite"—serve the content of `index.html` while preserving the URL in the browser. This is exactly what SPAs need.

**What the documentation led us to believe**: This would "just work." The docs show examples, explain the syntax, and give the impression that 200 rewrites are fully supported.

**What actually happened**: Wrangler immediately complained about "infinite loop detected" for most rules and ignored them. The rules that did parse still didn't work—we got 307 Temporary Redirects instead of 200 rewrites.

### The Infinite Loop Warning

Wrangler produced warnings like:

```text
Infinite loop detected in this rule and has been ignored. This will cause
a redirect to strip `.html` or `/index` and end up triggering this rule again.
```

This warning is cryptic. What does "strip `.html` or `/index`" mean? Why would rewriting to `index.html` cause a loop? The documentation doesn't explain this behavior, leaving developers to guess at what's happening internally.

## Searching for Answers

At this point, we turned to web searches and community forums. What we found was disheartening:

1. **Multiple community posts** describing the exact same 307/308 redirect issues
2. **A GitHub issue** on the React Router repository specifically about CloudFlare Pages and `_redirects`
3. **Conflicting information** about whether 200 rewrites are actually supported

One particularly revealing find was a community post stating that the documentation listed "Rewrites" as "No" (not supported), despite examples in the official docs suggesting otherwise. This contradiction is maddening for developers trying to implement a standard SPA pattern.

### The "Just Remove 404.html" Advice

Several sources suggested that if you don't have a `404.html` file at the root, CloudFlare Pages automatically treats your site as an SPA and serves `index.html` for missing routes.

**The assumption**: This would solve our problem elegantly.

**The reality**: This only works for SPAs at the root level. Our SPA lived in a subdirectory (`/svg-path-extended/`), so this automatic behavior didn't apply. The documentation doesn't clarify this limitation.

## The `wrangler.toml` Detour

We discovered that CloudFlare Workers (not Pages) has a clean solution for SPAs:

```toml
[assets]
directory = "./public"
not_found_handling = "single-page-application"
```

This configuration tells the Worker runtime to serve `/index.html` for navigation requests that don't match static assets. It's exactly what we needed.

**The assumption**: This would work with `wrangler pages dev` since Pages and Workers share underlying infrastructure.

**The reality**: The `not_found_handling` setting serves the *root* `index.html`, not the one in our subdirectory. Since our site has a landing page at `/` and the SPA at `/svg-path-extended/`, this approach couldn't work without restructuring the entire site.

## The Functions Approach

CloudFlare Pages supports Functions—serverless functions that can intercept requests. We created a catch-all function at `functions/svg-path-extended/[[path]].js`:

```javascript
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!/\.[a-zA-Z0-9]+$/.test(path)) {
    const indexUrl = new URL('/svg-path-extended/index.html', url.origin);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }

  return env.ASSETS.fetch(request);
}
```

**The assumption**: Functions would intercept requests before CloudFlare's default routing behavior.

**The reality**: The 307 redirects were happening *before* our function even ran. Something in the Pages infrastructure was redirecting requests before they reached our code.

## The `_worker.js` Solution

After hours of failed attempts, we finally found a working solution: the `_worker.js` file. This is an advanced Pages feature that lets you define a Worker that handles all requests to your site.

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // SPA routes under /svg-path-extended/ that don't have file extensions
    if (
      path.startsWith('/svg-path-extended/') &&
      path !== '/svg-path-extended/' &&
      !/\.\w+$/.test(path)
    ) {
      url.pathname = '/svg-path-extended/index.html';
      return env.ASSETS.fetch(url.toString());
    }

    return env.ASSETS.fetch(request);
  }
};
```

This finally worked. But not without additional pain.

### The Stale Process Problem

During testing, we encountered persistent 500 Internal Server Errors. The Worker code looked correct, but every request failed. After significant debugging, we discovered that `wrangler pages dev` leaves behind orphaned `workerd` processes that continue serving stale code. Killing the wrangler process wasn't enough—we had to hunt down and kill the `workerd` processes separately.

This is a significant developer experience issue. When your code changes don't take effect because of zombie processes, you waste time debugging code that isn't even running.

### The Base URL Solution

When loading the SPA from nested routes like `/svg-path-extended/workspace/new`, relative asset paths in the HTML (like `styles/theme.css`) would resolve incorrectly—the browser would request `/svg-path-extended/workspace/styles/theme.css` instead of `/svg-path-extended/styles/theme.css`.

The elegant solution was the HTML `<base>` tag:

```html
<head>
  <base href="/svg-path-extended/">
  <!-- All relative URLs now resolve from /svg-path-extended/ -->
</head>
```

This single line ensures all relative URLs in the document—including those in Shadow DOM components—resolve correctly regardless of the current browser URL.

## What CloudFlare Could Do Better

### 1. Be Explicit About `_redirects` Limitations

The documentation should clearly state:
- Whether 200 rewrites actually work in production (not just examples that imply they do)
- What causes the "infinite loop" warnings and how to avoid them
- That `_redirects` behavior differs between `wrangler pages dev` and production

### 2. Document the Subdirectory SPA Pattern

Many real-world sites have SPAs in subdirectories. The docs should include:
- A complete working example of this pattern
- Explanation of why the "remove 404.html" trick doesn't work for subdirectories
- The recommended solution (whether that's `_worker.js` or something else)

### 3. Document `_worker.js` More Prominently

This feature is buried in advanced documentation. Given that it's often the only reliable solution for complex routing, it deserves more visibility and complete examples.

### 4. Fix the `workerd` Zombie Process Issue

Developers shouldn't have to manually hunt down orphaned processes. `wrangler pages dev` should clean up after itself, or at least warn when stale processes are detected.

### 5. Align Local and Production Behavior

The 307/308 redirects we saw locally should match production behavior. Developers shouldn't have to deploy to production to test whether their routing works.

## Conclusion

What should have been a 10-minute configuration task became a hours-long debugging session. The core issue isn't that CloudFlare Pages can't handle SPA routing—it clearly can, with `_worker.js`. The issue is that the documentation guides developers toward solutions that don't work (`_redirects` with 200 rewrites), while the solution that does work (`_worker.js`) is poorly documented and not presented as the primary approach.

For developers facing similar struggles: skip the `_redirects` file for complex SPA routing. Go directly to `_worker.js`. It gives you full control, works reliably, and once you understand the pattern, it's actually simpler than trying to make `_redirects` rules work.

The CloudFlare Pages platform is powerful, but its documentation needs significant improvement to match that power. Until then, blog posts like this one—born from developer frustration—will have to fill the gaps.
