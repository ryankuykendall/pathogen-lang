# Blog synopsis v2: what changed from v1 while building post57

v1 (approved by the user 2026-10-20) is unchanged beside this file. The title, audience, arc and finale stayed as approved. What moved during sample work and review:

| v1 | As built | Why |
|---|---|---|
| Sample 1 `digits`: one row of digits | `01-digits`: typed string vs `Font.characters(styles, "digit")` fed to the same `fromGlyph` call | Voice guide asks for a contrast row on the first example |
| Sample 3 `two-alphabets`: rows via `{ script, category }` | `03-two-alphabets`: capitals by code-point range `(65..90)` / `(1040..1071)` | There is no uppercase category; ranges are the honest selection. Verified that `{ script: "Cyrillic", category: "letter" }` filters nothing in Raleway (all 238 are letters) |
| Sample 4: punctuation/symbol grid via `isPunctuation` / `isSymbol` | `04-kinds-of-character`: the whole Latin-1 Supplement block as a code chart, tinted by category, with P/S/N/O initials as a second signal | Teaches all the glyph properties at once; colour-blind safe after review |
| Specimen: fixed layout | Flowing layout: name and sample word fit to width, metrics band sized by the ascender, letters pick the largest size 10–20 that fits, scripts pinned to the bottom, guide labels stack | The user asked whether it takes other fonts without hand-tuning; verified with 5 local and 6 Google families |
| Filenames without prefixes | `01-` … `05-` prefixes | Matches recent posts |

Review dispositions: `../reviews-disposition.md` (blog section).
