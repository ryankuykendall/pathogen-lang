# Blog

Guidelines for blog content.

## Overview

- Blog posts are markdown files with YAML frontmatter (title, slug, date, description — all required except description)
- Compiled by `scripts/build-blog.ts` to: `playground/utils/blog-content.js` (SPA) + `website/blog-static/` (SEO static pages)
- Scaffold new posts: `npx tsx scripts/new-blog-post.ts`
- Build: `npm run build:blog`

## Frontmatter

```yaml
---
title: "Post Title"
slug: post-slug
date: 2026-01-15
description: "Optional description shown in blog index"
---
```

The `slug` must match the filename (without `.md`).

## Content Guidelines

- Use proper heading hierarchy (h1 title auto-added, start content at h2)
- Use `<code>` for inline code, fenced code blocks with language tags
- Supported syntax highlighting languages: javascript/js, bash/shell, json, html/xml, toml
- Images/assets go in `website/blog/assets/` and are referenced relatively
