# @font corpus sweep (downloads off)

73 files, 2026-10-23.

| Outcome | Files |
|---|---|
| compiled with font warnings | 1 |
| clean | 63 |
| failed after a font warning | 3 |
| failed (not font-related) | 6 |

## compiled with font warnings

- `packages/vscode-pathogen/test-fixtures/all-syntax.pathogen` (exit 0)
  - line 288: @font "Inter": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.

## failed after a font warning

- `project-docs/detail-hero-viewer/assets/experiments-in-random-variable-offsets.pathogen` (exit 1)
  - Error: Line 34, col 14: PathBlock.fromGlyph() requires font data, but no fonts were loaded. If you wrote an @font directive, font loading may have failed earlier — look for a preceding font-loading message.
  - line 22: @font "Noto Sans": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.
- `project-docs/editor-perf/user-perf-workspace.pathogen` (exit 1)
  - Error: Line 32, col 14: PathBlock.fromGlyph() requires font data, but no fonts were loaded. If you wrote an @font directive, font loading may have failed earlier — look for a preceding font-loading message.
  - line 20: @font "Gravitas One": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.
- `zzzoom-test.pathogen` (exit 1)
  - Error: Line 41, col 14: PathBlock.fromGlyph() requires font data, but no fonts were loaded. If you wrote an @font directive, font loading may have failed earlier — look for a preceding font-loading message.
  - line 29: @font "Ewert": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.

## failed (not font-related)

- `project-docs/glyph-listing/blog/probes/string-loop.pathogen` (exit 1)
  - Error: Line 4: for-each requires an array or object
- `project-docs/path-block-boolean-operations-audit/failure-matrix-2.pathogen` (exit 134)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-dashed.pathogen` (exit 134)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-solid.pathogen` (exit 134)
- `project-docs/path-block-boolean-operations-audit/failure-matrix.pathogen` (exit 1)
  - Error: Line 198, col 27: Unknown ProjectedPath method: project
- `project-docs/textblock-new-methods/to-path-block-demo.pathogen` (exit 1)
  - Error: Parse error at line 21, column 4: Missing ';'

## clean

- `project-docs/detail-hero-viewer/assets/experiments-in-random-variable-offsets-localfont.pathogen`
- `project-docs/glyph-halo-diagnosis/probes/angle-convention-and-winding.pathogen`
- `project-docs/glyph-halo-diagnosis/probes/dash-count-per-halo.pathogen`
- `project-docs/glyph-halo-diagnosis/probes/length-vs-bbox-cost.pathogen`
- `project-docs/glyph-halo-diagnosis/probes/per-dash-offset-cost.pathogen`
- `project-docs/glyph-halo-diagnosis/programs/01-as-written-standin-font.pathogen`
- `project-docs/glyph-halo-diagnosis/programs/02-dash-unit-floor-3.pathogen`
- `project-docs/glyph-halo-diagnosis/programs/03-dash-unit-floor-6.pathogen`
- `project-docs/glyph-halo-diagnosis/programs/04-anchored-placement.pathogen`
- `project-docs/glyph-listing/blog/probes/mark-bbox.pathogen`
- `project-docs/glyph-listing/blog/probes/raleway-info.pathogen`
- `project-docs/glyph-listing/blog/probes/raleway-oddities.pathogen`
- `project-docs/glyph-listing/blog/probes/review-checks.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-bebas-neue.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-inconsolata.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-libre-baskerville.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-open-sans.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-playfair-display.pathogen`
- `project-docs/glyph-listing/blog/probes/specimen-raleway.pathogen`
- `project-docs/glyph-listing/doc-examples/example-01.pathogen`
- `project-docs/glyph-listing/doc-examples/example-02.pathogen`
- `project-docs/glyph-listing/doc-examples/example-03.pathogen`
- `project-docs/glyph-listing/doc-examples/example-04.pathogen`
- `project-docs/glyph-listing/doc-examples/example-05.pathogen`
- `project-docs/glyph-listing/doc-examples/example-06.pathogen`
- `project-docs/glyph-listing/probes/info-raleway.pathogen`
- `project-docs/path-block-boolean-operations-audit/failure-matrix-iter-1-en.pathogen`
- `project-docs/path-block-boolean-operations-audit/failure-matrix-iter-2-en.pathogen`
- `project-docs/path-block-boolean-operations-audit/failure-matrix-iter-3-enc.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-e-only.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-lb-a-70.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-lb-l-70.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-a-60.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-compare.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-e-only.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-f-80.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-glyph-bbox.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-u-60.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-pf-u-70.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-rw-l-50.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-2-isolation-rw-u-70.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-3-isolation-cu-only.pathogen`
- `project-docs/path-block-boolean-operations-audit/iter-3-isolation-cutting-uband.pathogen`
- `project-docs/path-cutting/demo-glyph-cut.pathogen`
- `project-docs/variable-offset/anchor-glyph-overlay.pathogen`
- `website/blog/samples/post12/contour-decomposition.pathogen`
- `website/blog/samples/post12/glyph-layout.pathogen`
- `website/blog/samples/post12/metrics-upgrade.pathogen`
- `website/blog/samples/post12/per-char-transforms.pathogen`
- `website/blog/samples/post12/text-cutout-cutting.pathogen`
- `website/blog/samples/post12/text-cutout.pathogen`
- `website/blog/samples/post22/architecture.pathogen`
- `website/blog/samples/post27/07-glyph-spine.pathogen`
- `website/blog/samples/post27/08-glyph-aura.pathogen`
- `website/blog/samples/post27/09-finale-wordmark.pathogen`
- `website/blog/samples/post30/meridian-bloom.pathogen`
- `website/blog/samples/post40/o-cut-two-ways.pathogen`
- `website/blog/samples/post40/shattered-glyph.pathogen`
- `website/blog/samples/post57/01-digits.pathogen`
- `website/blog/samples/post57/02-coverage-bars.pathogen`
- `website/blog/samples/post57/03-two-alphabets.pathogen`
- `website/blog/samples/post57/04-kinds-of-character.pathogen`
- `website/blog/samples/post57/05-specimen.pathogen`
