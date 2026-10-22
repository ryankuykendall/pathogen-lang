# Reviews — Font namespace + 50 MB snapshot cap, 2026-10-19

## Code review (code-reviewer)

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| W1 | Warn | Coverage requests keyed by the style's font-weight, not the registered weight (`@font "X" 700` + style without weight → wrong/no slices) | **Fixed.** Keyed by `coverage.primary.weight`. Test: slices at 700, style without weight → request at 700 |
| W2 | Warn | getFontCoverage rescans per call; request ranges grow per call | **Fixed.** Per-compile coverage cache (WeakMap on evalState); ranges sorted + coalesced on insert. Test: 20 calls == 1 call |
| W3 | Warn | Whole-font load rides every compile | **Measured, not changed.** Noto Sans SC after Font.info (101 slices, 4.4 MB, 13,633 chars): keystroke → Ready 271–281 ms vs 206–208 ms without (+~70 ms). `verify/measure-cjk-keystroke.mjs` |
| W4 | Warn | Failed slices refetched every compile | **Fixed.** 60 s negative cache in font-loader `fetchSlices` |
| W5 | Warn | Retry doesn't recover a second dependent failure | **Fixed.** `recoverFontCoverage` loops up to 2 recoveries via shared `fetchForFontReports`. Test: two-step failure → third compile succeeds |
| W6 | Warn | 50 MB upload memory in workerd unproven | **Partially.** 49 MB upload verified against local wrangler/workerd (201, byte-identical round trip, 55 MB → 413); comment softened to say so. Production Workers limit not exercised |
| S1 | Sugg | `{}` selects the whole font | **Fixed.** Error + docs row |
| S2 | Sugg | Banner wording wrong for category selections; shown once | **Fixed.** "…for a Font call that needs the whole font."; docs say the note appears when slices arrive |
| S3 | Sugg | `\s` makes U+FEFF whitespace, misses U+0085 | **Fixed.** White_Space set; tests; docs note on isSpace vs category |
| S4 | Sugg | Hardcoded 50 MB in the client message | **Fixed.** Derived from SNAPSHOT_CLIENT_LIMITS |
| S5 | Sugg | glyphName costs a charToGlyph per glyph | Not changed (not measured as significant; W3 numbers include it) |
| S6 | Sugg | Weight tie-break mismatch | Covered by W1 |

## Content review (content-reviewer, docs/fonts.md + snapshots bullet)

12 findings. Applied: 1 numbers-from-the-CLI note + "complete font file"; 2 em / unitsPerEm; 3 code point + glyph glosses; 4 loop variable names (examples recompiled, same outputs); 5 three script names; 6 U+FEFF isSpace vs category note (verified); 7 missing error rows + banner note; 8 specimen: lede, old-style note, `define ViewBox(0, 0, 440, 90)`, re-rendered; 9 category order, font-weight fallback, VS Code symptom; 10 warning example uses the playground count 13,633; 11 slice defined at first use (first example kept as an overview); 12 no change.

## Blog post review (content-reviewer, website/blog/whats-in-the-font.md + post57 samples), 2026-10-20

19 findings, all applied:
- 1 specimen flow layout (verified with Unbounded, Syncopate, Bebas Neue, Playfair Display, Noto Sans SC, Roboto in the playground and 5 local families in the CLI)
- 2 the download gotcha says which selections fetch the whole font
- 3 block `size` includes control codes
- 4 weight fallback instead of "with a bold weight"
- 5 previews were already current
- 6 Ѐ/Ё look like È/Ë
- 7 Ё sits outside the А–Я range
- 8 x-height, ascender and descender, private-use, foundry glossed
- 9 why-use-it sentence and closing invitation
- 10 .notdef explains 936 + 81 + 1 = 1,018
- 11 sample 04: P/S/N/O initials, teal instead of green, 7.5 labels
- 12 object example switched to the Latin-1 letters (verified the Cyrillic version filtered nothing)
- 13 sample 02 uses category 'mark'; hover text in pathogen-api.ts and docs/path-blocks.md now say "fromGlyph or Font.glyphs"
- 14 sample 04 legend evenly spaced; dead `isDigit` branch removed; no-break-space label coloured to match its legend entry
- 15 "the family line at the top" instead of "line 7"
- 16 `pathogen` fences
- 17 caption says "up to five"
- 18 lone glyph labelled with its glyphName
- 19 synopsis-v2.md

Bugs found while building the post, fixed with tests:
- Editor diagnostics showed a false "not loaded" error on every Font call: the fontless pass now gets the "no fonts were loaded" wording, which is filtered.
- Font.info reported "Raleway Thin" / "Noto Sans SC Thin" for Google-served weights. `resolveFamilyNames` now uses the loaded family when the name table has leaked the variable font's default-instance name.
