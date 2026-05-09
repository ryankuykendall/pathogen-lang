# Blog

Guidelines and playbook for blog content authoring, review, and publication.

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

## Blog Sample Pipeline (`website/blog/samples/`)

Blog posts embed interactive `<mini-workspace>` demos that display Pathogen source code alongside a rendered SVG preview. The pipeline for creating and integrating samples:

### How It Works

1. **Author** a `.pathogen` source file in `website/blog/samples/postN/`
2. **Compile** the source to SVG using the CLI
3. **Reference** the sample in the blog markdown via `<mini-workspace src="...">`
4. **Build** the blog — `scripts/build-blog.ts` processes the tags

### Step-by-Step

```bash
# 1. Create sample source file
#    First line must be a viewBox comment: // viewBox="0 0 W H"
vim website/blog/samples/post1/my-sample.pathogen

# 2. Compile to SVG (same directory, .svg extension)
npx tsx src/cli.ts \
  --src=website/blog/samples/post1/my-sample.pathogen \
  "--output-svg-file=website/blog/samples/post1/my-sample.svg" \
  "--viewBox=0 0 W H" --width=W --height=H

# 3. Reference in blog markdown
#    <mini-workspace src="samples/post1/my-sample.pathogen" caption="..." code-open></mini-workspace>

# 4. Build
npm run build:blog    # processes tags → blog-content.js + blog-static/
npm run build:website # assembles public/ including samples
```

### What `build-blog.ts` Does with `<mini-workspace>`

The `processMiniWorkspaceTags()` function (line ~108) transforms each tag:

1. Reads the `.pathogen` source → base64-encodes it into a `code-data` attribute
2. Looks for a `.svg` file with the same basename → if found, embeds an `<img>` fallback
3. Syntax-highlights the source as a `<code>` child element (static fallback)

The resulting HTML is:
```html
<mini-workspace code-data="base64..." code-open caption="...">
  <code class="hljs language-pathogen">highlighted source</code>
  <img src="/blog/samples/post1/my-sample.svg" loading="lazy">
</mini-workspace>
```

### How `<mini-workspace>` Renders

The web component (`playground/components/blog/mini-workspace.ts`):

1. Decodes `code-data` → displays source in CodeMirror (read-only)
2. Finds `<img>` child → fetches the SVG URL → feeds it to `<mini-preview>`
3. `<mini-preview>` parses the SVG via `DOMParser('image/svg+xml')` and renders it in a pannable/zoomable viewport

**Critical**: Without the `.svg` file, the preview will be blank. The component does NOT compile Pathogen source at runtime — it only displays pre-compiled SVG.

### SVG with CSS Variables / `@property` Declarations

When a sample uses `CSSVar()` / `Color(CSSVar(...))`, the compiled SVG contains `<style>` blocks with `@property` declarations like `syntax: "<color>"`. The `<color>` token breaks XML parsing in `DOMParser` unless the style content is wrapped in `<![CDATA[...]]>`.

The compiler (`src/cli.ts`) automatically wraps `<style>` content in CDATA sections. If you encounter blank previews for reactive-color samples, this is the likely cause — re-generate the SVG from the compiler.

### CSS Variable Color Pickers

The `<mini-workspace>` component auto-detects `@property` declarations with `syntax: "<color>"` in the SVG's `<style>` block and generates interactive color picker controls. This detection happens in `_detectCssVarsFromSvg()`. You can also specify variables explicitly with the `vars` attribute.

### Checklist for New Samples

- [ ] `.pathogen` file with `// viewBox="0 0 W H"` comment on line 1
- [ ] Compiled `.svg` file alongside (same directory, same basename)
- [ ] `<mini-workspace>` tag in blog markdown with `src` pointing to `.pathogen` file
- [ ] `npm run build:blog` succeeds without warnings
- [ ] Visual verify via `npm run dev:website`

## Blogging Playbook

The end-to-end process for creating, reviewing, and publishing blog posts:

### 1. Synopsis

Author and review with the user a ~250-word synopsis for each blog post, including the title. This sets the scope, audience, and goals before any code or prose is written.

### 2. Code Examples

Assemble and review code examples that will be incorporated into the post using BBWPs and mini-workspaces. Follow the standards in [`../guidelines/code-example-guidelines.md`](../guidelines/code-example-guidelines.md).

### 3. Draft Blog Post

Author and review a draft blog post that incorporates code examples in mini-workspaces:

- Posts should liberally link to other published blog posts and to the documentation site.
- Posts should be available for review via `npm run dev:website`.

### 3.5 Pre-Review Validation

Before agentic review, run the sample validation script on all sample directories:

```bash
npx tsx scripts/validate-samples.ts website/blog/samples/postN/
```

This uses Puppeteer to load each compiled SVG, extract pixel-accurate `getBoundingClientRect()` for every element, and check:

1. **Margin compliance** — all elements ≥15px from viewBox edges
2. **Text-text collisions** — no overlapping text elements
3. **Text-geometry collisions** — no text overlapping path/shape geometry
4. **GroupLayer usage** — warns if >3 layers but no GroupLayer organization
5. **ViewBox consistency** — source comment matches compiled SVG

The script also generates **PNG previews** in `postN/previews/` for use during agentic review.

Fix all warnings before proceeding. This is currently a soft gate (warnings only). If visual issues continue to reach agentic review unfixed, escalate to a hard gate by using `--strict`.

### 4. Agentic Review

Draft blog posts go through a structured multi-persona review round table. See the full process in [`../guidelines/agentic-review.md`](../guidelines/agentic-review.md).

When invoking the content-reviewer agent, provide:
- Paths to blog post markdown and sample `.pathogen` files
- Paths to **PNG preview images** (generated in step 3.5) for visual assessment
- Instruct reviewers to Read each PNG and assess against the [schematic checklist](../guidelines/schematic-and-diagram-checklist-plus-antipatterns.md)

### 5. Final Version

Author the final version of the blog post incorporating all feedback compiled from the agentic reviewers.

### 6. Publish and Verify

1. Start local server: `npm run dev:website`
2. Run link checker: `npm run check-links`
3. Fix all broken links.
4. Rebuild the post from its parts.

## Multi-Part Series

When publishing a multi-part blog series:

1. **Different dates** — Posts should be published on different days to correctly preserve their desired order.
2. **Series TOC** — Posts should include a table of contents at the top showing each entry in the series and where the current post is ordered.
3. **Part subtitle** — Posts in a series should include a subtitle worded something like "Part N in our series on [topic or feature area]".

## Shared Content Guidelines

The following shared guidelines apply to blog content:

- [Code Example Guidelines](../guidelines/code-example-guidelines.md) — Standards for all embedded code examples
- [Schematic and Diagram Checklist](../guidelines/schematic-and-diagram-checklist-plus-antipatterns.md) — Review checklist and anti-patterns for diagrams
- [Agentic Review Process](../guidelines/agentic-review.md) — Multi-persona review process for published content
