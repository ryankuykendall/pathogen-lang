# Phase 1a docs: content review (2026-11-03)

This is the four-persona review (UXD, UXE, PM, ID) of `docs/modules.md`, which is new, and of the passages about imports in projects.md, syntax.md, cli.md, filters.md, masks.md, markers.md, gradients.md and path-blocks.md. The docs were written before the feature is built, as the contract for `12-phase-1-plan.md`.

## Verdict

**Approve with changes.** There are 27 findings: 6 must-fix, 10 should-fix and 11 to consider. Nothing could be rendered as a PNG yet, since the feature doesn't exist. Step 3 runs the docs examples as tests.

- **UXD:** The structure is clear, gotchas come first and the tables are easy to scan. But the error table describes several messages instead of quoting them.
- **UXE:** The docs match decisions 25–35 almost everywhere. Three promises are inexact (noise seeds, `style.width`, the prefix base), and several messages aren't quoted word for word.
- **PM:** "A library carries its own demo" is a strong pitch, and the playground limit is stated plainly, not as a placeholder. The cost of a demo and fonts shared across files should be gotchas.
- **ID:** The examples ladder well and the prerequisites callout is right. The workshop model arrives late, and its "counter" collides with the `counter.pathogen` example.
- **Cross-critique:**
  - PM wanted a shorter error table. UXE won, because step 3 tests every message word for word.
  - UXD called the workshop metaphor decoration. ID: keep it, move it up, and rename the counter example.
  - All four read the `../` example in projects.md as an error.

## Dispositions

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | MUST | modules.md promised the same noise "whether compiled or imported". That doesn't hold for a `NoiseFilter()` made inside an exported fn, and filters.md says less. The gotcha that the prefix isn't part of the seed was also missing. | **Applied.** The "Noise seeds" bullet uses the reviewer's wording. filters.md now says "at its file's top level, not inside a fn" and "gets the same seed". Implementation note for step 5: each file's counter keeps counting after load. |
| 2 | MUST | The error table lacked the `--root` message (projects.md points to it) and quoted no Cycler message | **Applied.** Added a `--root` row, plus separate rows for arrays, objects and Cyclers, each quoted in full |
| 3 | MUST | No quoted message for builder values, transforms or subscriptions. "Copy it first" is the wrong advice for a gradient | **Applied.** New row for a gradient/grid/mask (`Make your own, or export a fn that makes one`); the transform and subscription wording is spelled out in the export and use rows |
| 4 | MUST | `style.width = 4;` is already an error on your own objects. Dot assignment only works for layers, patterns, markers, filters, mesh points and gradients (index.ts:10526-10955), and objects.md documents bracket writes only | **Applied.** The row is now `style['width'] = 4;` |
| 5 | MUST | The pages didn't say the prefix comes from the path from the project folder. Readers would assume the path written in the import | **Applied.** The ids section states the rule (`/` → `-`, `.pathogen` dropped, `--`, the same whichever file imports it, which is why CSS can rely on it); the gotcha bullet adds "(its path from the project folder, then the id)". The one-line notes on other pages link to the rule, as the reviewer allowed |
| 6 | MUST | projects.md's `../` example read as an error, since written in `main.pathogen` it leaves the project | **Applied.** The table now uses the page's own tree and says which file each path is written in |
| 7 | SHOULD | The font rule was imprecise. The loader keys fonts by family **and weight** (load-fonts.ts:163-173), and within one file it quietly keeps the first font today. Missing gotcha: a library that relies on your `@font` fails on its own. fonts.md, though in the plan, was untouched | **Applied.** Fonts are shared by family and weight. The error is only *between two files*, so one-file programs are unchanged. The gotcha paragraph is added; the row is relabeled and reworded; path-blocks.md says "family and weight"; fonts.md's not-loaded row says an imported file's `@font` counts. **This is a precision on decision 33; it's flagged to the user.** |
| 8 | SHOULD | The docs implied a library fn can't pick a layer. Decision 35 says calling `layer('ink')` *when it runs* is fine | **Applied.** Added the `inkLine` example and the sentence on what is and isn't an error |
| 9 | SHOULD | The cost of a demo wasn't stated | **Applied.** "Keep demos light…" with the reviewer's wording |
| 10 | SHOULD | "Imports come first" didn't say whether `@font` and `define` count | **Applied, strict reading of decision 32:** they count. Only comments may come first. Updated the rule, the gotcha and the error message. Loosening later stays possible |
| 11 | SHOULD | Find-references in 1a wasn't stated. syntax.md's F2/quick-fix sentence contradicted the modules page for imports | **Applied.** VS Code bullet: "Find All References lists the uses in the current file only". syntax.md: for an import, the quick fix changes the name after `as`, and F2 can't rename it yet. Implementation note: a built-in name only reaches an import through `as` / `* as`, since no file can export one |
| 12 | SHOULD | cli.md's lead-in promised a `file` field that the JSON example didn't show, and mixed `--json` warnings into the `--log-file` section | **Applied.** The original lead-in is restored, a second entry with `"file"` is added, and one sentence after the example covers `--json` warnings |
| 13 | SHOULD | The log label differs from decision 31 (`[file:12]`), and the warning format for imported files wasn't stated | **Applied, docs win** (they're the contract). Logs read `[parts/gears.pathogen line 12] …`, extending today's `[line 1]`. Warnings read `parts/gears.pathogen:12:5: warning: …`, stated in modules.md and cli.md. Plan amended |
| 14 | SHOULD | The workshop model came after the rules, and "counter" also meant `counter.pathogen` | **Applied.** The model is now right after the first example, and the pen section opens with "A fn on the counter is a tool…". The example is renamed to `ids.pathogen` / `lastId` / `nextId()` throughout, including the error row |
| 15 | SHOULD | One of your own ids could match an imported one (`arrows--tip` vs `tip` in arrows.pathogen), and no decision covered it | **Applied.** It's the existing duplicate-id error, naming both files and lines. It's checked when both defs reach your SVG, which is when the clash exists; an unused imported def never clashes. Extends decision 33's "clashes are errors"; flagged to the user |
| 16 | SHOULD | The freeze also covers a file's private arrays and objects (step 4 freezes everything reachable from root bindings), but "can't change its variables" reads as "can't reassign" | **Applied.** Both sentences now cover "what's in them". New row: `Cannot change seen — it belongs to names.pathogen, whose values are fixed once it has loaded. Return a new array instead` (the code picks "belongs to" or "comes from" by comparing the running code's file with the value's file) |
| 17 | CONSIDER | The first example exported `toothDepth`, which nobody imports | **Applied.** It's now a plain `const`, which also shows that `gear` sees its file's unexported names |
| 18 | CONSIDER | The `viewbox` claim had no example, and decision 28's sketch used `viewbox.center`, which doesn't exist | **Applied.** `centerMark` example using `originX/originY/width/height`, run as a single-file probe: `M 90 50 h 20 M 100 40 v 20` |
| 19 | CONSIDER | The error example (`.nope`) didn't come from the gears example; the `imported from` form and chains through several files weren't shown | **Applied.** Probes showed `gear(55, 40, 12)` fails with **no position at all** (`Cannot access property 'x' on non-object value`), and a missing argument fails at the call in main. The example now uses `assert` inside `gear` (probe: `Line 1, col 34: assertion failed: …`). **Chains: one `called from` line per file boundary crossed**, calls within a file not listed, and the same for nested imports. The missing-`;` form comes from a probe (`line 2, column 21`). A fence's first-line comment counts as part of the file for line numbers |
| 20 | CONSIDER | "Your file gets two things" undercounted, and the CSSVar `@property` crossing (decision 35, step 5) wasn't documented | **Applied.** Reworded to "Into your drawing come only its exports, and what the exported values you use rely on…"; CSSVar added there and to "Only what's used reaches your SVG" |
| 21 | CONSIDER | The default-import sentence answered the wrong question for JS users | **Applied.** "Pathogen has no default export, so … is an error". The error row keeps "which isn't supported", true until 1b |
| 22 | CONSIDER | The two links near the top went to different kinds of places | **Applied.** One link to "In each tool" |
| 23 | CONSIDER | projects.md said imports get "the same messages" as `@font`. But the web-address and file-name rows differ, and the font-content rows don't apply | **Applied.** It now says "matching messages for the path rules … Modules lists them all" |
| 24 | CONSIDER | masks.md contradicted itself ("unique across all" vs "within the file"), and markers.md's new sentence interrupted the `{|m|}` explanation | **Applied.** masks.md: "unique across the masks and clip paths a file makes … so two files can both use `my-mask`" (no "never clashes", given #15). gradients.md likewise. markers.md: the sentence moved after the trailing-block paragraph |
| 25 | CONSIDER | "hex code" was ambiguous (code point or UTF-8? case? width?) | **Applied.** The Unicode code point in lowercase hex, no padding: `_20`, `é` gives `_e9`, `v1.2` gives `v1_2e2`. A rare ambiguous spelling is caught by the prefix-collision error |
| 26 | CONSIDER | Re-exporting wasn't mentioned | **Applied.** Added a `parts/kit.pathogen` example (`export const gear = gears.gear;`), and why `import { gear }` plus `export const gear` declares it twice. Probe: a fn and an enum held in a `const` still work (`doubled(3) = 6`, `Sizes.Few = 8`) |
| 27 | CONSIDER | "top of your file" read as the first lines; "That's why…" read as a design rationale | **Applied.** "your file's top level"; "So you can write library-style code…" |

## The user's feedback (2026-11-03)

| # | Feedback | Disposition |
|---|---|---|
| U1 | The opening ("A program can use names from another .pathogen file: a fn …, a list …, an enum …") reads as "disjointed and opaque". It undersells the feature, which is about code organization and libraries that let functions, constants and capabilities be reused | **Rewritten.** It now opens with the purpose: split a growing program into files, keep reused code in a library, use it from every program in the project, and a fix reaches every drawing. Then one sentence on `export`/`import`. Reuse across *projects* isn't possible in 1a, since imports can't leave the project folder, so a new gotcha bullet says so: copy the file into the other project. Sharing across workspaces is a later phase (decision log §16.6) |

## Found while checking the examples (not review findings)

- `star(…)` given a string tooth count (`'twelve'`) silently draws `m 0 0 z` instead of failing. This is an existing bug, recorded as a follow-up.
- `gear(55, 40, 12)` fails with `Cannot access property 'x' on non-object value` and **no line or column**. Many evaluator errors have no position (audit §2). Under the cross-file error format, an error without a position still needs a file and a call site: step 3 gives such errors the line of the statement that raised them, **only when they're raised in an imported file**. Errors in the compiled file keep today's text, as the docs promise.

## Decisions taken while applying the review (flagged to the user)

1. **Fonts are shared by family *and weight***, and the clash is an error only between two files (#7). Within one file, today's keep-the-first behaviour is unchanged.
2. **One of your ids matching an imported one is the duplicate-id error**, checked when both defs reach your SVG (#15).
3. **An error's trace lists one `called from` line per file boundary crossed**, and nested imports list each `imported from` (#19).
4. **`@font` and `define` count as statements**, so imports must come before them (#10, strict reading of decision 32).
5. **Find All References** lists uses in the current file only, in 1a (#11).
