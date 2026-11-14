# Step 10: the final content review of docs/workspace-files.md (2026-11-13)

Note 52's step 10: "The docs page: remove the [TO CONFIRM] marks as they're settled, and run its content review again before it publishes with 2e." "Let's move onto step 10."

The page isn't published yet: it publishes with 2e. Every section was reviewed when it was written (steps 4–9); this pass reads it as a whole. It is a content-reviewer run with the four personas (UXD, UXE, PM, ID), plus the one `docs/exporting.md` sentence that note 52 parked for this step (the Precision setting's new home).

## Before the review: my own pass

- **No [TO CONFIRM] marks are left** (all settled 2026-11-09, note 52).
- **Placeholders left on purpose:**
  - line 59, `[month]` and `[If the page publishes with 2e: …]`: they're filled in at publication.
- **For you:** line 57, `[TO DECIDE, note 41 #4]`, which program SVG, PNG and PDF export use. You deferred it to 2g ("Let's circle back to this when we do the planning on export project"). The page publishes with 2e, before 2g, so it must say what Export does then.
  - *Answered 2026-11-13:* "Sounds good for now. We can spend more time during 2g." The page says what's built: Export and Copy SVG save the drawing the preview shows. The mark goes, and 2g revisits.
- **Found:** line 215, `[When data files and fonts can be added: …]`, is an internal note in the body. It moves into the header comment.

## The review

**Roundtable, in short.**
- **UXD:** clear, consistent UI words. But there's no map of the screen, and the row menus are never introduced.
- **UXE:** accurate apart from five things: a wrong CLI flag in exporting.md, the program list's order, `imported from` lines, Windows-reserved names, and touch screens versus narrow screens.
- **PM:** "same shape as a project folder" is the right promise. The page needs to say early that the editor and the preview are separate, and what happens to an uploaded CLI project.
- **ID:** consistent terms, but the order is weak: `pathogen.json`'s list, the chip and the dots are used before they're explained. There are no worked examples.
- **Disagreements:**
  - a screenshot (UXD for; UXE and PM against, since it would go stale);
  - how serious the upload gap is;
  - reorder the sections (ID) or explain terms where they first appear (PM).

18 findings: 3 must-fix, 7 should-fix, 8 to consider. I checked the accuracy findings against the code: cli.ts:644; workspace-edits.ts:776 (`planSetMain`); files.ts:67/87; uploads.ts:86/107; renameHint and moveHint, workspace-edits.ts:523–550.

| # | Group | Finding | Disposition |
|---|---|---|---|
| 1 | MUST | Nothing says up front that the editor and the preview are separate, so "doesn't change what the preview shows" relies on a rule that comes 16 lines later | **Applied.** A "Three parts work together" paragraph after the intro, with the preview line made true for one program: "with several, the program chip … chooses which" |
| 2 | MUST | The row menus and the workspace's menu are used but never introduced | **Applied.** A bullet in "The file tree and tabs": the ⋮ on hover, a right-click or the menu key; the workspace's menu is the ⋮ at the right end of the breadcrumb |
| 3 | MUST | exporting.md:89 gave `--to-fixed <N>`, which the CLI refuses as an unknown option (cli.ts:644, 668), and it didn't say where the inspector is | **Applied, the reviewer's wording.** Also **added** a "Round the numbers" subsection to docs/cli.md, which never mentioned the flag. Both forms were checked with the CLI: `=` works; a space is "Unknown option" |
| 4 | SHOULD | An uploaded CLI or VS Code project isn't described: it keeps its folder's name, `/` imports change meaning, and its `pathogen.json` (main and order) is dropped | **Applied:** the Upload folder… example now shows the folder you pick, and a new bullet covers project folders, with the reviewer's workaround (drag what's inside onto empty space). The workaround is your call to keep |
| 5 | SHOULD | Terms are used before they're explained (`pathogen.json`'s list; the chip, dots and panel in "The main") | **Fix B applied:** "A new workspace" says the list holds the programs, main first. **Fix A (a reorder) not taken:** it's churn on a structure each section was approved in, and #1's paragraph now introduces the chip early |
| 6 | SHOULD | The program list's order was described as "the order they were added", which is wrong after two Set as mains | **Applied, the reviewer's wording** |
| 7 | SHOULD | `imported from` lines are missing from "Errors in other files" | **Applied** at both places |
| 8 | SHOULD | "On a phone" mixes the narrow rule (800 px or less) with the touch rule (`hover: none`); "narrower than 800" was off by one | **Applied.** The section is now "On a phone or a tablet", with the two rules apart |
| 9 | SHOULD | Windows-reserved names (`con`, `aux`, `nul` …) are refused, and an upload adds `-1` to them | **Applied** at the name rules and in uploads |
| 10 | SHOULD | No worked example | **Applied:** "Try it: move a fn into a module", four steps, with `gear` named in step 2 |
| 11 | CONSIDER | The +'s precedence (selected folder before the editor's file) was listed the wrong way round | **Applied** |
| 12 | CONSIDER | Limits: `pathogen.json` isn't counted; 50 MB can't be reached with 20 files of 1 MB; the name and path lengths are missing from the table | **Applied.** The 50 MB row and "or 50 MB" moved into the header comment with the data-file and font note |
| 13 | CONSIDER | Copy Debug Info: excerpts only for the first five errors; "length" is lines; layers have no file or line | **Applied, the reviewer's wording** |
| 14 | CONSIDER | Cmd+click also opens an import's path or a `* as` name at the file's top, and it belongs with navigation, not errors | **Applied:** moved to "The file tree and tabs" and extended |
| 15 | CONSIDER | Rename… and Move to… say what will change before you confirm | **Applied,** quoting the real strings |
| 16 | CONSIDER | The page and Set as main's menu disagree on whether publishing uses the main | **Header checklist:** settled when 2e decides what publishing does |
| 17 | CONSIDER | "Deleting the last program" packed four effects into one bullet; a screenshot | **Sub-bullets applied.** The screenshot isn't taken: UXE and PM's staleness point; the page places things in words |
| 18 | CONSIDER | The [TO DECIDE] covers Copy SVG and the preview's Export button too; current behaviour belongs in the preview section; Copy URL is a change, not a "not yet" | **Applied, with your answer:** "**Export** and **Copy SVG** take the program the preview shows" in "The preview and the program list"; the mark is gone; Copy URL moved to "What changed" |

## A second pass over the applied wording

The same reviewer re-read the edited page, exporting.md's sentence and cli.md's new subsection, looking only for problems the edits brought in. It found six, all applied:
1. **cli.md:** "0 to 20, as the playground's Precision setting does" implied the playground offers 0 to 20. It now says the playground offers 0 to 4.
2. **exporting.md:** there's no visible "Toggle inspector" label. It's the tooltip of the top button at the preview's top right, and the sentence now says so.
3. **The "Not yet" note** ("…or made from one") now points to Uploading files, where a project folder's arrival is described.
4. **Copy Debug Info's first bullet** went from one error to five. It's plural now, in step with the next bullet.
5. **The upload sentence under Limits** also names the 255-character path, now that the table lists it.
6. **"Only the chip changes which program the preview shows"** was contradicted by two exceptions the page itself describes: the program shown going away, and the first program in an empty workspace. It's now "**You choose the program shown with the chip.**", with the rest of the bullet unchanged.

Checked against the code and right: the ⋮ at the right end of the breadcrumb; Copy SVG taking the preview's drawing; the anchor `#exporting-optimizing-output`; the CLI's "Unknown option" for `--to-fixed 2`.

## Not yet decided, and for publication

- **Approval to publish.** The page publishes with 2e, and the docs process asks for your approval of the reviewed page before it does. This is that review.
- **Kept in the header comment, for publication or later:**
  - publishing and the main (finding 16, 2e);
  - the data-file, font and 50 MB limits (after phase 2);
  - the `[month]` and the snapshot sentence (2e).
