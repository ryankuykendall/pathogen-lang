# Phase 3a: your answers to the first mockup round, and mockups v2

2026-11-24. Your review of note 73's docs and mockups (v1), what changed because of it, and the v2 mockups that show the changes.

## Before and after

| | v1 (note 73) | v2 (this note) |
|---|---|---|
| File types | JSON (`.json` `.geojson` `.topojson` `.fold`) and text (`.txt`) | JSON only. Text is on hold, with the string methods that went with it |
| String methods | `lines`, `trim`, `split(separator)`, `replace`, `startsWith`, `endsWith`, `toNumber` | None new. The drafts are kept in `held-text-imports/` |
| Icons | Braces for JSON, a page with lines for text | Braces for every data file |
| New data file | In the **+** menu with small text "JSON or text"; a name field in the tree, where you type the extension; JSON starts as `[]` | **New data file…**, no small text; a dialog asks for the name and the type; a new file starts as `{}` |
| A save over a limit | The sentence in the breadcrumb's save status (3b), or "Not saved" and a toast (3c, 3d) | "Not saved" in the save status, and the reason in the error panel at the bottom of the editor, under the file's name |

## What you said

The mockups "generally look pretty good", with three pieces of feedback:

1. "In the initial round of work, I would like to limit the supported data file types to well known structured file formats such as JSON, CSV, TSV, YAML, and SVG. For some reason we have also added a generic .txt files with some plans for adding methods that would allow us to more easily parse those files. In order to do that adequately, we would need to support regular expressions and that is too out of scope for the initial round of work. So let's put a hold on .txt files for the time being until we have a better idea of what we want to support."
2. "Let's drop 'JSON or text' from the subtitle of the files menu item 'New data file'. Instead what we could do is present a modal that allows the user to name the file and select the file type before proceeding."
3. "In mockup 3b, the error message is inserted into the bread crumb rather than the standard error block at the bottom of the code editor. The toast version does not make sense either. Let's definitely put it in the error block."

Your answers to note 73's questions:

1. **Icons:** "No text files...we can use curly braces for all data files for the time being."
2. **A new data file:** "Start with curlies" (`{}`).
3. **A save over a limit:** "In the error block."
4. **Copy Debug Info** (size and first 20 lines, lines cut at 200 characters): agreed.
5. **Public pages, snapshots and downloads** carry data files: agreed.
6. **Hover and completion** as shown: agreed.
7. **A project over 50 MB in all** adds nothing: agreed.

## What changed

**The docs** (still drafts, still uncommitted; they land with 3a's parser change, as note 73 planned):
- `docs/data-import.md`: the Text section, the `.txt` row of the file types, the text hover and the text example of the not-UTF-8 message are gone. The message for an extension Pathogen doesn't read now lists `.pathogen` modules and JSON files only, with `./data/profile.txt` as its example.
- `docs/syntax.md`: the string methods are gone, and `.split()` reads as it does today. The correction that `.empty()` and `.includes()` return `true`/`false` stays: that's how strings behave today.
- `docs/modules.md`, `docs/projects.md`: "JSON or text" becomes "such as JSON"; the can't-import message matches data-import.md.
- `docs/workspace-files.md`:
  - JSON only;
  - **New data file…** opens a dialog for the name and the type. The type adds its extension, and typing one chooses that type. Create is off, with the reason, for a taken name, an extension that isn't one of the four, a name that breaks the name rules, or a workspace at 20 files. A new file starts as `{}`;
  - a refused save says why in the error panel at the bottom of the editor, under the file's name, with any other errors, until the file saves. It saves when it fits again, made smaller or with other files deleted to make room.
- **The content review** (`reviews/phase-3a-v2-docs-review.md`): 5 must-fix findings, 3 should and 3 consider. Every must and should was taken; two of the consider items weren't. It made the dialog's refusals and the 50 MB case explicit, as above.
- The drafts that were cut are kept in `held-text-imports/`: the whole first `data-import.md` and the string-method sections. The backlog has an entry, "Text imports and string methods", with your words.
- Checks: every `#` link in the six pages resolves after `npm run build:docs`. `tests/docs-examples.test.ts` has one failure, the expected one: `import gears from "./data/gears.json";` (the default import 3a's parser adds). The `profile.txt` example that also failed went with the Text section.

**The mockups, v2:** http://localhost:3001/website/bbwp/2026-11-24-11:54:26--modules--3a-data-files-mockups-v2.bbwp.html (`mockups-3a-data-files-v2/`, 11 states in both themes; its README says what changed in each). v1's page and PNGs are unchanged, and v1's page now points to v2.
- **2a:** the menu item reads **New data file…**, with no small text, as New module has none. The ellipsis says it opens a dialog, as Upload files… does.
- **2b, the dialog:** the playground's own dialog frame (the one Delete… asks with), holding:
  - a name field with the extension after it;
  - a line that shows the file it will make and that it starts as `{}`;
  - the four types, each with what it's for.
- **2c:** a taken name, in the tree's own words: "data/ already has gears.json." Create is off.
- **3b:** "Not saved" in the save status, and in the error panel under `data/trips.json`: "Not saved: 5.4 MB, more than the 5 MB a data file can be in a workspace. Your edits stay in the editor."
- **3a, 4a:** `profile.txt` is left out of an upload and of a project's import, with the reason: what a workspace holds.

## Build items this adds

- **A workspace's data kinds are 3a's types:** `.json .geojson .topojson .fold`. `src/workspace/files.ts` lists `.csv .tsv .txt .svg` today. CSV and TSV join with 3b. `uploads.ts` `kindReason` gets the new reason ("a workspace holds .pathogen files and data files (.json, .geojson, .topojson and .fold).").
- **The refused save in the error panel.** `workspace-view` redraws the panel's sections after every compile, and editing the file starts one. So the refusal has to be a section of its own, merged with the compile's sections, and it stays until a save succeeds. Otherwise it disappears at the next keystroke. Its heading opens the file. Copy Debug Info includes it, as it does every section.
  - **A refused save is tried again when the workspace changes,** not only when the file is edited: deleting other files to get under 50 MB lets it save (the docs promise "When it fits again, … it saves").
- **The dialog:** `confirm-dialog`'s frame, or a sibling with its styles, with a name field and a radio list:
  - Enter creates and Esc cancels;
  - the extension follows the chosen type, and typing a known extension chooses that type;
  - the taken-name, bad-name and 20-file messages are the tree's (`workspace-edits.ts`), shown under the field, and they turn Create off. So does a name that ends in an extension that isn't one of the four (`trips.txt`), which needs a message of its own.
- **A new data file starts as `{}`.**

## Still open

1. **Which formats, and when.** You listed JSON, CSV, TSV, YAML and SVG. Today's plan (note 72): 3a JSON, 3b CSV and TSV, and SVG import as phase 4. YAML isn't in any plan yet. *Recommended:*
   - 3a: JSON, with GeoJSON, TopoJSON and FOLD, which are JSON;
   - 3b: CSV and TSV, as planned;
   - then YAML, as a short step of its own. It reads into the same values as JSON (objects, arrays, numbers, strings, `true`/`false`, `null`), so freezing, hover and completion come with it. Its cost is a YAML reader in all three tools' bundles, and choosing how strictly to read it (YAML 1.2, where `no` is a string, not `false`; aliases capped);
   - SVG stays phase 4, after a design round of its own. Note 37 found that SVG files exported from Inkscape, Illustrator or Figma lean on transforms and groups, so the first plan for it would place most real files wrongly.
2. **A `.pathogen` file over 1 MB** is refused today with the whole sentence in the save status: the surface you turned down for data files. *Recommended:* every refused save says why in the error panel, as in 3b. The docs' Limits paragraph is already written that way, for every limit, so it's accurate only with a yes here.
3. **The dialog** (2b, 2c): the type list, its descriptions, and Create off for a taken name. *Recommended: as shown.*
4. **The docs:** your approval of the revised drafts.

## Next

Your answers to these, then the build, tests first. Nothing is pushed until 3a works on all three surfaces.
