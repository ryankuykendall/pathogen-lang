# Documentation

Public-facing documentation — every `.md` file here is compiled into the site.

## Overview

- Compiled by `scripts/build-docs.ts` via the `DOC_FILES` constant
- Outputs: `playground/utils/docs-content.js` (SPA) + `website/docs-static/index.html` (SEO)
- Heading IDs auto-generated with section prefix (e.g., `syntax-variables`)
- Build: `npm run build:docs`
- Plans, primers, and internal reference docs live in `project-docs/`

## Publishing

- **Documentation is written first** — before implementation. When adding, removing, or revising Pathogen language features, begin by updating the relevant docs to define the contract, then proceed to implementation. See `src/CLAUDE.md` for the full development lifecycle.
- **Important**: After creating a new `.md` file in `docs/`, add it to the `DOC_FILES` mapping in `scripts/build-docs.ts` or it will not be published
- Verify with `npm run build:docs` and `npm run check-links`

## Shared Content Guidelines

The following shared guidelines apply to documentation content:

- [Code Example Guidelines](../website/guidelines/code-example-guidelines.md) — Standards for all embedded code examples
- [Schematic and Diagram Checklist](../website/guidelines/schematic-and-diagram-checklist-plus-antipatterns.md) — Review checklist and anti-patterns for diagrams
- [Agentic Review Process](../website/guidelines/agentic-review.md) — Multi-persona review process (mandatory for all published content including documentation)
- [Text Collision Debugging](../website/guidelines/text-collision-debugging.md) — Rules for diagnosing and preventing text-vs-element collisions in diagrams
