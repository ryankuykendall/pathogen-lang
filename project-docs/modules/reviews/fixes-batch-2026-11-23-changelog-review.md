# The fixes batch of 2026-11-23: the CHANGELOG entry's content review

One content-reviewer pass over the draft (`tmp/2f/changelog-fixes-batch-draft.md`), checked against the code and notes. No must-fix findings; 5 should-fix, 3 optional.

| # | Finding | Disposition |
|---|---|---|
| 1 | Sections as in the 2f entry: new tests under Added > Development, the cache bullet under Fixed > Playground, the fresh-checkout fix under Fixed > Development. The CHANGELOG never recorded the admin fix itself, live since 2026-11-17 | **Taken,** with a Fixed > API line for the admin fix, saying it wasn't recorded then |
| 2 | The admin bullet left out that each write applies only its own change, and the moment that remains | **Taken** |
| 3 | The heading as a full sentence; no internal "2f" in the intro | **Taken** |
| 4 | The first bullet: the site let browsers keep the files; the 4 hours count from the last fetch; the rule covers the whole site's scripts, styles, data, WebAssembly and source maps | **Taken.** Its claim waits for the live check after the push; the line changes if Cloudflare replaces the header |
| 5 | Note 65's update records this batch too | **Taken** |
| 6 | Name what the asset test checks | **Taken** |
| 7 | The fresh-checkout bullet: the new asset test imports the worker too | **Taken** |
| 8 | A Tested line | **Taken:** the full suite (9,483), the code review |

## After the push (2026-11-23)

The fix went live 76 s after the push (b5cefe4b..0a9438c8), and Cloudflare kept the header. On pathogen.studio, the code files come back `private, no-cache` with `cf-cache-status: BYPASS`, and a revalidation answers 304 (`tmp/2g/wait-cache-fix.ts`, `tmp/2g/check-304.ts`). Finding 4's line now says so, and adds that Cloudflare's servers no longer keep their own copy of these files. The entry also covers everything since the last one: note 66's push choice and notes 67 to 69 (2g's design).
