# Phase 3a: a lighter New data file dialog, and your answers to note 74

2026-11-24. Your review of mockups v2 (note 74): the order of the formats, the 1 MB `.pathogen` refusal, and a lighter dialog, drawn as mockups v3.

## Before and after

| | v2 (note 74) | v3 (this note) |
|---|---|---|
| The dialog | A Name field with the extension after it; under it, a Type group of four rows (JSON, GeoJSON, TopoJSON, FOLD), each with its extension and what it's for | One field: the name, and the extension after it as a dropdown (`.json` first). The line under it: `Adds data/trips.json` |
| What each type holds | Always shown, in the Type rows | Shown only in the dropdown's list, under each extension, as the + menu shows its small text |
| A `.pathogen` file over 1 MB | The whole sentence in the save status (today) | "Not saved" in the save status, and the reason in the error panel, as for a data file |

## What you said

"The modal in 2b definitely looks like an improvement, however it also feels a little over designed. Could we do something a little lighter weight that turns the text field into a compound element the text field on the left and the extension selection as a select/dropdown (almost suffix like) on the right. When the user clicks on the extension drop down, we can use progressive disclosure to provide hints about the contents of the files."

Your answers to note 74's open questions:
1. **Formats and when:** "Your plan for format sequencing is great. Completely makes sense and I am on board."
   - 3a: JSON (with GeoJSON, TopoJSON and FOLD);
   - 3b: CSV and TSV, with `with { … }`;
   - then YAML, a short step of its own;
   - SVG stays phase 4, after a design round of its own.

   3c, the cast list, stays where note 72 put it, after 3b. Whether YAML comes before or after it is decided when 3b is done: YAML doesn't need the cast list.
2. **Every refused save in the error panel,** a `.pathogen` file over 1 MB too: "Agreed with 2 (put it in the error panel.)"
3. **The dialog:** made lighter, as above.

## The mockups, v3

http://localhost:3001/website/bbwp/2026-11-24-12:09:07--modules--3a-data-files-mockups-v3.bbwp.html (`mockups-3a-data-files-v3/`, the dialog's three states in both themes). The rest of v2 stands. v2's page now points to v3 for the dialog.
- **2b, the dialog:**
  - one field, the name and then the extension as a dropdown;
  - the line under it says what Create adds: `Adds data/trips.json`;
  - the dialog is narrower than v2's (400 px).
- **2c, the list:** opened from the extension.
  - Each extension has what it holds as small text: "JSON: tables, lists and settings", "GeoJSON: places and shapes on a map", "TopoJSON: maps with shared borders" and "FOLD: origami crease patterns".
  - A check marks the one chosen.
  - It's styled after the tree's + menu (`file-tree.css` `.menu`).
- **2d:** a taken name, in the tree's words, with Create off.

## What changed in the docs

`docs/workspace-files.md`:
- The New data file… bullet describes the one field, the extension's list and what it shows.
- The bullet under "Adding files and folders" says the dialog is where you choose the extension.
- The header comment records this note.

The Limits paragraph already covered every limit, so answer 2 needs no change there.

## Build items

- **The extension's dropdown is a listbox of our own, not a native `<select>`:** a native option can't hold the second line, which is the point of the list.
  - The button has `aria-haspopup="listbox"` and `aria-expanded`; the list has `role="listbox"`, with `role="option"` and `aria-selected` on each item.
  - Keyboard: Enter, Space or ↓ opens the list; ↑/↓ move; Enter chooses; Esc closes the list only. The native dialog closes on Esc, so its `cancel` has to be stopped while the list is open.
  - The list is placed from the button's position (`position: fixed`), so the dialog's own box doesn't cut it off.
- **Typing an extension chooses it:** `trips.geojson` sets the dropdown to `.geojson` and leaves `trips` in the field. An extension that isn't one of the four (`trips.txt`) turns Create off with a message of its own.
- **The 1 MB `.pathogen` refusal moves to the error panel,** through the same section as a data file's: "Not saved: 1.2 MB, more than the 1 MB a .pathogen file can be in a workspace. Your edits stay in the editor." The save status reads "Not saved".
- Note 74's build items stand: the refusal's own error-panel section, kept until a save succeeds and tried again when the workspace changes; the tree's messages in the dialog; a new file starts as `{}`.

## Still open

1. **The v3 dialog** (2b to 2d). *Recommended: as shown.*
2. **The docs:** your approval of the revised drafts (note 74's question 4; the content review is `reviews/phase-3a-v2-docs-review.md`).

## Next

With both, 3a's build starts, tests first: the parser change for the default import comes first, with the docs commit.
