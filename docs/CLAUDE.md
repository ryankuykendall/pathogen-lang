# Documentation

Public-facing documentation — every `.md` file here is compiled into the site.

## Overview

- Compiled by `scripts/build-docs.ts` via the `DOC_FILES` constant
- Outputs: `playground/utils/docs-content.js` (SPA) + `website/docs-static/index.html` (SEO)
- Heading IDs auto-generated with section prefix (e.g., `syntax-variables`)
- Build: `npm run build:docs`
- Plans, primers, and internal reference docs live in `project-docs/`
