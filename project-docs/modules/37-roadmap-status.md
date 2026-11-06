# Where the modules, data and files effort stands

2026-11-05, after phase 1a shipped (pushed `8cbe778..3bb0e09`, deployed). The plan of record is still `02-decision-log-v1.md` (§16.4 phase order, decision 17). `12-phase-1-plan.md` stays as written: it is the record of what phase 1a set out to do. This note says what happened since and what comes next. Deferred items live in `backlog.md`.

## The goal

From the domain survey (`01-survey-v1.md` §1, requirements R2 and R4):
- **R2, modules and libraries:** about 26 domains name a library as the deliverable. Modules are "the delivery vehicle for all shared kits" (joints, checks, chart kits), so the core language stays small.
- **R4, data import:** CSV and JSON first, then image sampling, then format readers written as libraries (GPX, weaving drafts, airfoils, origami). Flagship domains: personal data art, RC ribs, weaving, guest lists.

## The phases

| Phase | What | Status |
|---|---|---|
| 0b | One shared loader for every surface; fonts in VS Code | Shipped 2026-10-26 |
| 0a | Language groundwork: named fns see the names where they're written (the drawing follows the call), `const`, built-in names reserved | Shipped 2026-11-02 |
| 1a | `import`/`export`, `module;` libraries that never draw, isolation, fixed values, prefixed ids, fonts and errors across files, in the CLI and VS Code | Shipped 2026-11-05 |
| **2** | **Multi-file workspaces in the playground:** mockups, then storage, then the editor and preview | **Next. Started 2026-11-05** |
| 3 | Data imports: JSON, CSV, text | Waits for the language changes other file types need (below) |
| 4 | SVG import | Waits likewise, and its scope needs another look (below) |
| 5 | Globs, sharing libraries between workspaces and people, images | Later |

**Where that leaves the goal:** a kit can be written as a library and used from another file, in the CLI and VS Code. On pathogen.studio a workspace is one file, so `import` is an error there. By the three-surface rule modules are shipped-incomplete until phase 2; decision 25 accepted that knowingly. Sharing kits with other people needs phase 2 (files in a workspace) and phase 5 (importing another workspace's library). Phase 2 also gates data in the playground: a CSV has to live in the workspace.

## Decisions on 2026-11-05

Your answers, in your words:

| Item | Decision |
|---|---|
| Default import of a drawing (`import badge from "./badge.pathogen";`, decision 5) | **Delayed.** "I'm not sure I understand the use case for this or believe it is a priority." In `backlog.md`, not tied to a phase. It stays an error that shows the `{ }` and `* as` forms |
| Rename and find-references across files | **Backlog.** "YES, let's add this to the backlog." In `backlog.md`. F2 keeps refusing shared names with the reason |
| Updating plan 12 | You asked whether it's necessary. It isn't: the project keeps old artifacts as they were and adds new ones, so 12 stays the record of the plan and this note carries the status. What 12 says that step 5e replaced is listed below |
| Phase 2 | **Start, mockups first.** "Yes, let's begin work on this. There is quite a bit of work to do here." |
| Phase 3 (data) before phase 2 | **No.** "These should wait until we make the language changes to support these other file formats." |
| The `demo { }` block | **Delayed.** "I am not sure that we need to focus on the demo block." In `backlog.md`. A module's preview stays empty with its notice |

## What plan 12 says that step 5e replaced

Step 5e (2026-11-04, `23-modules-are-libraries-plan.md`, `24-phase-1a-step5e.md`) made modules strict libraries. Where 12 disagrees, 23/24 and docs/modules.md win:
- "`export` is allowed in any file, and ignored in the file being compiled" (decision 33): `export` outside a `module;` file is an error.
- "The file still compiles and draws on its own, so a library can carry its own demo" (Before and after): a module never draws at its top level; compiled alone it draws nothing.
- "Its top-level drawing runs too and is then discarded" (decision 33): a module can't draw while it loads.
- Decision 35's layer, transform and subscription rows: a module can't hold them at all, so the use-site errors were removed.
- Step 5's subscription dispatch at the end of a module's load: no subscriptions can exist.
- "Only the file that is a module can be imported" is new in 5e: importing a file without `module;` is an error.

## The language changes data and SVG imports need

Your point on phase 3: these come first. From the decision log (§14.3, §15.2, §15.3); none is built:
- **The default import form for files that aren't modules:** `import cities from "./data/cities.csv";`. Today any default import is an error.
- **`with { … }` hints:** `with { type: "text" }`, CSV's `header`, `delimiter`, `decimal`, `skip`, `comment`.
- **Type names** for `columnTypes` (decision 12: TypeScript-style, contextual, lowercase primitives and PascalCase structured types), and how a bare number in an angle column gets its unit.
- **String tools** for text-format readers: string to number, trim, lines, find and replace.
- **A value for an SVG document**, with `querySelector` / `querySelectorAll` (decisions 13–14).

### Data and SVG import today

| Format | Status | Decided | Open |
|---|---|---|---|
| JSON (`.json`) | Not built | The JSON value, fixed once loaded, parsed once in the shared loader; errors point into the file; hover and completion from the data | Little |
| GeoJSON, TopoJSON | Not built | Read as plain JSON. No projections: the domain survey made real-world GIS a non-goal | "JSON plus helpers", never designed |
| CSV, TSV | Not built | Rows keyed by the header, types inferred per column, `columnTypes` | Angle units for bare numbers |
| SVG from other tools | Not built | A document value with `querySelector`; disallowed markup dropped while parsing, by a shared parser (no DOM in the CLI or the worker); v1 elements: `tagName`, `id`, classes, `getAttribute`, `toPathBlock()` | Transforms, units and viewBox scaling, paint, text and `<use>` were all after v1. Exports from Inkscape, Illustrator or Figma rely on transforms and groups, so that v1 would misplace most real files. The survey never asked for SVG import; it was a suggestion for laser, plotter and stencil users |
| Plain text | Not built | A string, so format readers can be libraries | Needs the string tools above |

What works now: JSON pasted as a Pathogen object literal compiles as is (quoted keys, `true`, `null`, nested arrays; checked 2026-11-05), and can live in a `module;` file as `export const cities = [ … ];`. One SVG path's `d` commands paste into a program's top level.

## Phase 2: what it covers

From the decision log (§16.3, §16.4, §16.6) and decision 16:
- mockups of a multi-file workspace first (the playground rule: mockups and your review before any UI change);
- storage: a manifest plus content-addressed blobs (lean in §12, decision 13 there), and migrating today's single-string workspaces;
- the editor: a file tree, a main file, opening and switching files;
- the preview: the main file by default, with a toggle to pin it to the file being edited (decision 16); VS Code mirrors it (moved here from 1a by decision 25);
- imports between files in a workspace, through the 1a loader with a workspace host;
- the language services in the playground keyed by file plus import graph (`playground/utils/scope-cache.ts`, plan 12 follow-ups).

The phase 2 audit (`38-phase-2-audit.md`) maps what in the playground, the API and storage this touches.
