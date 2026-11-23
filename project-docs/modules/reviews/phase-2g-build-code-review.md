# Phase 2g build: the code review

2026-11-23. One code-reviewer pass over the 2g build (note 70): `playground/services/zip.ts`, `project-import.ts`, `workspace-download.ts`, the New Workspace page, the menu, Export's title, the Snapshot panel, `programNames`, and their tests. Result: 1 must-fix, 5 should-fix (one of them test gaps), 7 nits. The must-fix and four of the should-fix were taken, with a test each; the test gaps were taken where the page can reach them.

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. The page's `escapeHtml` (`textContent` → `innerHTML`) escapes `& < >` but not `"`, and the name field is `value="${escapeHtml(name)}"`. 2g fills the name from a picked .zip or folder, whose name anyone can choose: `x" autofocus onfocus="…" y=".zip` would add live attributes at pathogen.studio's origin. (Open as new workspace already filled it from another user's workspace name, so this predates 2g too.) | **Taken:** `escapeHtml` escapes quotes (the file's `esc`). Test: a .zip named that way leaves the field's value as typed and adds no attribute. A later audit found a third route, a link's title (`/workspace/new?state=…`), open on the live site; tested too (`phase-2g-changelog-review.md`) |
| 2 | should-fix. A .zip can hold the same path twice; the second overwrote the first in the planner's map, so a file vanished without a line | **Taken:** the last copy comes in, as unzip takes it, and "Not added" says "is in the project twice: the last copy comes in." Test added |
| 3 | should-fix. The end-record search took the last `PK\5\6` in the tail, without checking that its comment reaches the end of the file; a comment holding the signature would mislead it | **Taken:** a record counts only when its comment length reaches the end; failing that, the last one (bytes added after a .zip). Test: a comment holding a fake record |
| 4 | should-fix. `new Uint8Array(expected)` sat outside the `try` in `inflate`, so a size no browser can hold threw a `RangeError` instead of a `ZipError`. The planner's 1 MB checks keep it from happening today | **Taken:** allocated inside the `try`; a 2^40-byte zip64 size rejects as damaged. Test added |
| 5 | should-fix, to verify. The plan branch of Create wasn't gated by the page's mode. The page is one element kept between visits: pick a project, then open code from a link (`?state=`), and Create sent the project's files instead of the code | **Confirmed and taken:** `_projectInPlay()` gives the project only on the blank page; the guard, the create call and the render all use it. Test: a pick, then a `state` link, creates from the code |
| 6 | should-fix. Test gaps: a stale pick, leaving mid-read, Create off while reading, a typed name surviving a pick, Cancel's button, the stray-drop listeners' removal, the touch layout; zip: data descriptors, truncated deflate | **Partly taken.** While a pick is read the pickers aren't shown, so a second pick can't overtake it; tests added for Create off while reading (then the card), and a read that ends after the page was left changing nothing. Already covered: a typed name (view test), Cancel (view test), the touch layout and stray drops (`verify-2g.ts`, both themes), data descriptors and broken deflate (`zip.test.ts`) |
| 7 | nit. A non-zip64 archive of exactly 65,535 entries reads as zip64 | No change: the standard's own ambiguity |
| 8 | nit. A file at a .zip's top beside one folder (a stray `README.md`) stops the unwrap | No change: the docs' rule ("in one folder, or at its top") |
| 9 | nit. `pickedFromInput` drops dot names across the whole path, and its 1,000-file limit counts every file | No change: Upload's behaviour, and the page says when the limit cut in |
| 10 | nit. An empty `webkitRelativePath` would make the picked name the file's | No change: a folder picker always gives it |
| 11 | nit. A renamed folder lists each file under it | No change: Upload's toast does the same |
| 12 | nit. With a project picked there's no drop area, so a drop on the card is stopped silently | No change: the card offers Choose another… |
| 13 | nit. `JSON.stringify` per refresh in `_refreshPrograms` | No change: a handful of programs |

## Recheck

Fixes 1 to 4 OK. Fix 5 left one gap:

| # | Finding | Disposition |
|---|---|---|
| R1 | should-fix. `disconnectedCallback` dropped a read in progress but kept `_project` as "reading". The element added back in blank mode showed "Reading…" with Create off and no way out (the card had no Choose another… while reading) | **Taken:** the page drops its project on disconnect, and the card offers Choose another… while reading too, so a slow read is never a dead end. Tests: taken out mid-read and added back starts blank; Choose another… during a read drops it |

## After the fixes

The full suite, the type check (three errors in files 2g doesn't touch, as before), the linter on the new files, and `verify-2g.ts` (40 checks on the dev server) pass.
