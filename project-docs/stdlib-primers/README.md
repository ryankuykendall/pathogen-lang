# Stdlib Primers

Seven internal primer pages, best read in order — one per deterministic
stdlib function shipped 2026-08-02/03: `hash01`, `hash11`, `hashRange`,
`smoothstep`, `bump`, `noise`, `noise2`. (Later pages deliberately lean on
the hash trio's mechanics instead of re-explaining them.) Each page: what the function does
in plain language, why you'd reach for it, and five worked examples that
build from a bare picture of the function to a finished composition.

Audience: experienced programmers **without** a formal CS background or
deep math. Every jargon term (hash, lattice, Hermite, bilinear, raised
cosine) is translated into a mechanical sentence on first use.

## Viewing

These pages are **local-only** — never deployed to pathogen.studio.

```bash
npm run serve:bbwp
# open http://localhost:3001/project-docs/stdlib-primers/index.html
```

They are also linked from the pinned section at the top of
`website/bbwp/index.html`. Pages are self-contained (inline SVGs, CSS with
dark fallbacks) and open directly from disk, though the theme toggle and
light theme need the served `theme.css`.

## Regenerating

```bash
npx tsx project-docs/stdlib-primers/build-primers.ts            # everything
npx tsx project-docs/stdlib-primers/build-primers.ts --only hash01
npx tsx project-docs/stdlib-primers/build-primers.ts --check    # compile-check only
```

The generator compiles every example **in-process** (`compile` +
`generateSvg` with `stroke: 'none'` — required, the default `#000` stroke
is invisible on the dark plate) and fails loudly on any compile error or
unresolved `{{example:...}}` token. All examples are CPU-path (no GPU
gradients), so no Puppeteer is involved.

## Authoring

- Edit `content/<fn>/primer.md` (frontmatter: `fn`, `title`, `hook`,
  `order`, `docsAnchor`; body: markdown prose with `{{example:NN-name}}`
  tokens) and `content/<fn>/NN-name.pathogen` (line 1: `// viewBox="..."`
  comment; body starts with `define ViewBox(...)`).
- **Never edit the generated `*.html`** — regenerate instead.
- Two figures are intentionally nondeterministic and churn on every
  rebuild: the `randomRange` contrast rows in `hash01/01-ask-twice` and
  `hashRange/01-drop-in-swap`. The reshuffling is the lesson.
- If stdlib syntax or semantics change (as the `<<` worker refactor did),
  update `content/` and re-run — the pages are fully regenerable.
