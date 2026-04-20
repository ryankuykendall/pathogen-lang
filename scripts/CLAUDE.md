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
| `rotate-admin-token.ts` | Generate and deploy a new admin token via Wrangler |
| `kill-port.ts` | Kill processes on a port (default 3000); used by `kill:wrangler` |
| `install-git-hooks.ts` | Install git hooks from `scripts/git-hooks/` |
| `compile-bbwp.ts` | Compile `.pathogen` → SVG → HTML artifact in `website/bbwp/` |
| `serve-bbwp.ts` | HTTP server for browsing BBWP artifacts (default port 3001) |
| `update-bbwp-index.ts` | Regenerate `website/bbwp/index.html` from directory listing |
| `check-links.ts` | Puppeteer link checker for blog posts and documentation pages |
| `validate-samples.ts` | Puppeteer sample validator: margins, collisions, GroupLayer checks + PNG previews |

## Git Hooks

Git hooks live in `scripts/git-hooks/` as TypeScript files. The `install-git-hooks.ts` script writes shims into `.git/hooks/` that invoke the TypeScript source via `npx tsx`.

| Hook | Purpose |
|---|---|
| `git-hooks/pre-commit.ts` | Warn when public-API additions in `src/evaluator/`, `src/stdlib/`, `src/parser/`, or `src/api-surface.ts` are not accompanied by changes in `docs/*.md` or `scripts/build-docs.ts`. Warning only — never blocks. Suppress with `git commit --no-verify`. |
| `git-hooks/post-commit.ts` | Remind to update CHANGELOG.md |
