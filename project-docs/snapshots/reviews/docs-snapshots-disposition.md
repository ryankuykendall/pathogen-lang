# Content review — docs/snapshots.md (Phase 1), 2026-10-19

Reviewer: `content-reviewer` agent (4-persona: UXD, UXE, PM, ID). Scope: all of `docs/snapshots.md` (new) + one new paragraph in `docs/exporting.md`. Judged against the primer's revised plan and mockup v3 (doc-first; feature not built).

Verdict (reviewer): well organised, honest about the main gotcha. Five over-promises or design mismatches needed fixing; no restructuring.

| # | Tier | Finding | Disposition |
|---|------|---------|-------------|
| 1 | MUST | "in one click" — capture is popover + save | Applied ("Press Snapshot, name it, and save.") |
| 2 | MUST | Delete advice "start a new workspace from them" contradicts re-roll | Applied |
| 3 | MUST | Gotchas only at bottom; heading "the one thing" | Applied: heading → "Before you start…"; intro names delete-with-workspace + 500 cap |
| 4 | MUST | Random sources incomplete (Cycler shuffle); "same image every time" over-promises | Verified `src/evaluator/index.ts:7472` (only Math.random sources: random, randomRange, Cycler shuffle). Applied |
| 5 | MUST | "appears instantly" superlative; "everything on this page is the image" | Applied |
| 6 | SHOULD | Signed-out listed as "unavailable" but button still opens panel | Applied; heading → "When you can't take a snapshot yet" |
| 7 | SHOULD | Error-state rule narrower than mockup | **Decision: option A** — disabled on any compile error. Recorded in primer |
| 8 | SHOULD | "downloading its SVG" — Download SVG removed | Applied |
| 9 | SHOULD | Quota advice assumes a cross-workspace list | Applied (says plainly there's no single list yet) |
| 10 | SHOULD | Export "same options" over-promises (grid, legend source) | Applied in both pages. **Plan requirement:** legend uses the snapshot's code; grid unavailable for snapshots. Recorded in primer |
| 11 | SHOULD | Two meanings of "snapshot" (publishing.md) | Applied parenthetical on the new page; publishing.md untouched |
| 12 | SHOULD | 1 MB code cap missing from Limits | Applied |
| 13 | SHOULD | "see above" → link | Applied (`#snapshots-before-you-start-random-values-re-roll`, verified in build) |
| 14 | SHOULD | Start new workspace: name, opens?, snapshot stays | **Decision:** `<workspace> — <snapshot name>`, opens in editor, snapshot stays. Applied + primer |
| 15 | CONSIDER | Prerequisites callout | No callout (standalone, deliberate). Added "not available in the CLI or VS Code" to intro |
| 16 | CONSIDER | Button location loose; split form not described | Applied |
| 17 | CONSIDER | Meta row "size" ambiguous; no first-note affordance | Applied |
| 18 | CONSIDER | "bookmark" metaphor collides with browser bookmarks | Applied ("photo … with the recipe written on the back") |
| 19 | CONSIDER | Sign-in stated three times; "anonymous workspaces" undefined | Applied (Limits bullet removed) |
| 20 | CONSIDER | (a) Enter in note field; (b) copying a workspace; (c) publishing.md | (a) **Decision:** Enter saves from name; in note Enter = newline, ⌘/Ctrl+Enter saves — docs + primer. (b) Applied. (c) No change |

Verification: `npm run build:docs` passes; all cross-page anchors (`#publishing-publishing-workspaces`, `#exporting-exporting-your-work`, `#snapshots-snapshots`, `#snapshots-limits`, `#snapshots-before-you-start-random-values-re-roll`) present in `website/docs-static/index.html`. `npm run check-links` not run (needs `build:website` + server on :3000).
