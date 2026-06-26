# Scripts

All scripts in this directory are TypeScript files executed via `tsx`.

## Conventions

- **TypeScript only** — all scripts use `.ts` extension
- **Commander CLI** — every script uses Commander for `--help`, argument parsing, and description
- **Executed via `tsx`** — scripts are not compiled; npm scripts use `tsx scripts/X.ts`
- **Async pattern** — wrap main logic in Commander's `.action()` callback

## Template for New Scripts

```ts
import { Command } from 'commander';

const program = new Command();
program
  .name('script-name')
  .description('What this script does')
  .option('--flag <value>', 'Description of flag')
  .action(async (opts) => {
    // Main logic here
  });
program.parse();
```

## Existing Scripts

| Script | Purpose |
|---|---|
| `build-docs.ts` | Convert markdown docs to `playground/utils/docs-content.js` |
| `build-blog.ts` | Convert blog markdown to `playground/utils/blog-content.js` |
| `build-website.ts` | Assemble CloudFlare Pages output in `public/` |
| `new-blog-post.ts` | Scaffold a new blog post with frontmatter |
| `rotate-admin-token.ts` | Generate a new ADMIN_TOKEN secret on the `pathogen-api` Worker and redeploy. (After the API split, admin endpoints live on the API Worker, not the Pages project.) |
| `migrate-anonymous-workspaces.ts` | One-off: re-key workspaces from anonymous user IDs to an authenticated user. Reads/writes WORKSPACES KV via wrangler. |
| `kill-port.ts` | Kill processes on a port (default 3000); used by `kill:wrangler` |
| `install-git-hooks.ts` | Install git hooks from `scripts/git-hooks/` |
| `compile-bbwp.ts` | Compile `.pathogen` → SVG → HTML artifact in `website/bbwp/` |
| `serve-bbwp.ts` | HTTP server for browsing BBWP artifacts (default port 3001) |
| `update-bbwp-index.ts` | Regenerate `website/bbwp/index.html` from directory listing |
| `check-links.ts` | Puppeteer link checker for blog posts and documentation pages |
| `validate-samples.ts` | Puppeteer sample validator: margins, collisions, GroupLayer checks + PNG previews |
| `security-browser-audit.ts` | Puppeteer audit: injects malicious SVG payloads directly into the playground's preview iframe (bypassing the compiler) and verifies the iframe sandbox + CSP block every outbound request. The browser-only counterpart to `tests/security/`, since JSDOM does not enforce CSP. Run via `npm run security:browser-audit` (requires `npm run dev:website` running on :3000). |
| `perf-pan-zoom-audit.ts` | Puppeteer pan/zoom performance profiler. Creates a throwaway workspace from a `.pathogen` source, drives the real pan/wheel handlers, and reports the main-thread split (page.metrics) + off-main raster/commit totals per scenario. Built to diagnose interactive jank and A/B fixes. Run via `npm run perf:panzoom` (requires `npm run dev:stack`). See `project-docs/pan-zoom-performance/`. |
| `perf-transform-probe.ts` | Puppeteer render-mechanism probe: drives the large SVG via viewBox-mutation vs CSS-`transform` (translate / translate+scale) and compares `RasterTask`/commit-wait. Used to prove CSS-transform pan avoids re-raster for the SVG-in-iframe (~25× cheaper). Run via `npm run perf:transform-probe`. |

## Git Hooks

Git hooks live in `scripts/git-hooks/` as TypeScript files. The `install-git-hooks.ts` script writes shims into `.git/hooks/` that invoke the TypeScript source via `npx tsx`.

| Hook | Purpose |
|---|---|
| `git-hooks/pre-commit.ts` | Warn when public-API additions in `src/evaluator/`, `src/stdlib/`, `src/parser/`, or `src/api-surface.ts` are not accompanied by changes in `docs/*.md` or `scripts/build-docs.ts`. Warning only — never blocks. Suppress with `git commit --no-verify`. |
| `git-hooks/post-commit.ts` | Remind to update CHANGELOG.md |
