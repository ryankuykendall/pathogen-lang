# Rationale: why we're unifying the render pipeline

## Summary

Pathogen has three implementations that walk `CompileResult` and produce SVG. They drift. Each new defs-producing constructor has to touch all three, and the gap between "shipped in CLI" and "shipped in playground / VS Code" has repeatedly produced user-visible regressions. The Marker feature alone surfaced two such regressions in a single day of debugging this session. Collapsing the three implementations into one — with two thin adapters for the two output formats (string + DOM) — replaces a manual parity discipline with a structural guarantee.

## The incident chain

All dates 2026-04-20 unless noted.

### 1. Original Marker implementation shipped incomplete (2026-04-13, commit `87298e0`)

The Marker feature landed with:

- Evaluator support (constructor, methods, enum validation, defs-ID uniqueness check)
- `src/svg-generator.ts` defs emission (CLI)
- Language-services hooks (completion, hover)
- 345 lines of tests in `tests/markers.test.ts`
- Demo `.pathogen` files in `project-docs/svg-markers/`

But **not** shipped:

- No `docs/markers.md` (no published user documentation at all)
- No playground DOM wire-up in `playground/components/svg-preview-pane.ts` (a five-file chain was missing: compiler.d.ts type, store.d.ts field, store.ts initializer, workspace-view forwarding, preview pane injection)
- `evaluateWithContext()` (the function the playground worker calls) returned a `CompileResult` without `markers` in its return object — a latent bug in `src/evaluator/index.ts:7668` that went undetected because `compile()` did include it and the CLI tests only exercised `compile()`

Tests passed. CLI worked. `.vsix` was not retested. Production shipped with silently-broken marker rendering in the playground.

### 2. The user discovered the gap (2026-04-20, morning)

The user went to browse the docs site and noticed Markers weren't documented. This prompted:

- Commit `8f9d02a` — wrote and published `docs/markers.md`
- Commit `8585315` — added a pre-commit hook warning when public-API changes ship without `docs/` updates
- Commits `a1c82e2` + `c4d38dc` — restructured the CLAUDE.md hierarchy to make "docs-first" and "three-surface parity" explicit policies

The docs-first work was solid. The parity policy was correct on paper but had no automated enforcement — it was a manual checklist.

### 3. User tried to use Markers in production (2026-04-20, afternoon)

The user reported that markers weren't rendering. Provided their `.pathogen` source and the rendered SVG outerHTML from DevTools. The DOM showed `marker-end="url(#test-marker)"` on the path but no `<marker>` element in `<defs>`.

**First failed iteration (I attributed to user error, got it wrong):**

I asked about viewBox sizing, `markerUnits` scaling, and `marker` shorthand vs explicit `marker-start/mid/end`. The user applied each suggested change. None worked. I trusted my Puppeteer tests (which tested the landing page with `compile()` directly) over the user's direct DOM evidence for three rounds.

**Second failed iteration (found the playground wire-up gap, fixed it, declared done):**

Discovered that the five-file chain from compile result to preview-pane DOM was never wired for markers. Added `markers` to:

- `playground/types/compiler.d.ts`
- `playground/types/store.d.ts`
- `playground/state/store.ts`
- `playground/components/workspace-view.ts`
- `playground/components/svg-preview-pane.ts`

Committed as `560b32c`. Tested with Puppeteer against the running dev server: compile result had `markers: [1]`, DOM had `<marker id="test-marker">`. Declared end-to-end verified. Pushed to production.

This was a false positive. The Puppeteer test called `window.SvgPathExtended.compile()` directly. The playground workspace calls `compileWithContext` via a Web Worker. Those are two different functions with different return shapes.

**Third iteration (user pushed us to test on dev:website, found the real bug):**

The user came back saying production still didn't work. Reproduced in incognito. I kept attributing to cache/session. Eventually the user insisted on testing on dev:website (localhost), and that's where the gap finally surfaced: Puppeteer testing the worker-based `compileWithContext` path returned `markers: []` while `compile()` returned `markers: [1]`.

The underlying bug was in `src/evaluator/index.ts:7668` — `evaluateWithContext()` builds the full `compileResult` internally but forgets to include `markers` in its return object. One missing line. Present since the Marker feature first shipped.

Fixed in commit `efb63c0`, pushed to production, verified working.

## What this cost

The user spent most of a day debugging something that should have been caught by the shipping process:

- ~8 rounds of back-and-forth trying to diagnose
- Multiple requests to hard-refresh, try incognito, clear cache — pushing debugging onto them when the bug was in our code
- Two "verified end-to-end" claims in commit messages that were empirically wrong because the verification tested the wrong function
- Emotional cost: the user explicitly said "that was generally a terrible development experience"

## Structural failures (not individual mistakes)

The individual mistakes are surface symptoms. The structural failures are:

1. **Three separate code paths that interpret `CompileResult` allows "works in one surface, broken in another" to be a normal state.** The policy doc calls this drift; the code treats it as the default.
2. **No automated cross-surface parity test.** The "three-surface parity" policy (commit `c4d38dc`) said to manually verify each surface. Nobody ever wants to run a five-step manual checklist, so nobody does.
3. **`compile()` vs `compileWithContext()` diverged without a type-level constraint forcing them to agree.** Two different functions with two different object literals for their returns, separate places to forget fields. Added `markers` to the type but not the implementation of one of them.
4. **Puppeteer tests against the landing page aren't tests of the workspace.** The workspace uses the worker, a different compile API, and different data flow. A passing landing-page test gave me false confidence.

## What this refactor fixes and doesn't fix

**Fixes:**

- Collapses the three render paths to one shared tree + two thin adapters. A new defs-producing constructor touches one file.
- Replaces the manual parity checklist with `tests/render-channel-parity.test.ts` that structurally diffs CLI and playground output for every fixture.
- Gets the VS Code preview onto the same renderer via `mountInto`, so it benefits from the parity test automatically.
- Adds byte-identity snapshot tests (`tests/render-snapshots.test.ts`) so every future code change has to acknowledge when it's changing CLI output.

**Does not fix:**

- The `compile()` vs `compileWithContext()` API duplication. That's a separate problem in `src/evaluator/index.ts`. The `markers`-forwarding bug specifically is already patched (commit `efb63c0`) and has its own regression test. A bigger cleanup of those two entry points is a later project.
- Automated VS Code webview testing. Phase 5 includes a manual `.vsix` install step because we don't have a VS Code test harness. The manual step is the gate until one exists.
- The three-surface policy doc's remaining enforcement gaps (e.g., docs-first). That's already covered by the pre-commit hook from commit `8585315`.

## How this document should be read

If you're about to add a new defs-producing constructor, read:

- [`DESIGN.md`](./DESIGN.md) — the VNode shape and adapter API you'll be adding a case to
- [`PLAN.md`](./PLAN.md) — if any phase hasn't landed yet, to know what you can and can't rely on

If you're wondering why the codebase looks the way it does, this file is the explanation. Keep it truthful and up-to-date as the refactor progresses. When something in this narrative becomes inaccurate because a later fix superseded it, update the entry rather than deleting it.
