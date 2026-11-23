# The fixes batch of 2026-11-23: code review

One code-reviewer pass over the batch after 2f: the Pages worker's cache rule for the playground's code (`website/_worker.ts`), the test stand-in for the generated blog data (`vitest.config.ts`, `tests/fakes/blog-data.ts`), and the tests `tests/pages-asset-cache.test.ts` and `tests/api/admin-writes-keep-saves.test.ts`. No critical findings: 2 warnings, 4 suggestions.

| # | Finding | Disposition |
|---|---|---|
| 1 | The HTML the worker fetches from Pages (the SPA shell, `/docs`, `/blog`) isn't wrapped; if Cloudflare held it for 4 hours too, the shell could point at modules from another deploy | **No change, pinned:** live (2026-11-23) the SPA shell (`/workspaces`) and `/blog` come back `public, max-age=0, must-revalidate`: Cloudflare doesn't hold HTML. The tests now check that the four HTML routes pass Pages' header through |
| 2 | `CODE_FILE` matched only `.js`, `.mjs` and `.css`, case-sensitively | **Taken:** `.json`, `.wasm` and `.map` too, case-insensitive; tested |
| 3 | The Response copy | No change: the reviewer found it correct (304 and 204 bodies, HEAD, 206, headers) |
| 4 | The blog-data stand-in | No change: it can't shadow the real file, and it only applies under vitest |
| 5 | The asset test didn't check that the request reaches Pages unchanged, nor the HTML routes | **Taken:** both |
| 6 | The requeue test wasn't mutation-checked as the approve test was | **Done:** against the old whole-record write, it fails (`rev` 0, not 1), as the approve test does |

**Left for the live site:** whether Cloudflare keeps `private, no-cache` on the code files. The docs don't settle it; `tmp/2f/check-cache-headers.ts` checks after the push.
