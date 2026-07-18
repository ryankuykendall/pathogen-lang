# Regex-Audit Remediation — Status

Tracks execution of the plan in [remediation-plan.md](remediation-plan.md)
against the audit in [audit-2026-07-18.md](audit-2026-07-18.md).

## Completed (committed 2026-07-18)

| Phase | What | Commits |
|-------|------|---------|
| 0 | Characterization tests (path tokenizer, round-trips, parseColor grammar) | `3fe01ec` |
| 1 | Shared `src/evaluator/path-data.ts`; eliminated the draw/drawTo serialize→reparse round-trip; consolidated 3 duplicate tokenizers + 2 serializers | `8e572b7`, `a179491`, `4c7c3e6`, `e8c5a8b` |
| 2 | Cursor-tokenizer rewrite of `svg-sanitize.ts` (parsing soundness: quote-aware, aliasing family closed) | `aacf39e`, `32f413d`, `3f283a9` |
| 2+ | **Sanitizer security hardening**: deny-list → allow-list (closes `<meta>` hijack), presentation-attr `url()` validation (closes SSRF), per-element href scoping, unquoted-attr rejection. Two confirmed-exploitable pre-existing holes. | `4e70ffa` |
| 3 | Tokenizer-based `parseColor` (`src/color-parse.ts`); byte-compatible acceptance + whitespace-separator fix | `ad951d9`, `055c18b` |
| 4 | Strict style-block declarations via a proper parser (no regex scrape); lenient AST-build + strict evaluator; `Missing ';'` compile errors + editor diagnostics | `adfc5eb` |
| 4-follow-up | Fixed 22 blog/demo samples missing a trailing `;`; recompiled BBWPs | `c19d73d`, `41da0d9` |
| 5a | Shared `src/css-value-utils.ts` (`splitTopLevel`, balanced `matchFunctionNotation`); replaced 2 duplicate splitters + 3 buggy fn-notation regexes | `f557c4a` |
| — | CHANGELOG entry | `b043e96` |

All phases verified: full suite green (88 files, ~3690 tests); render byte-snapshots unchanged; CLI output byte-identical on representative programs; security exploits rejected end-to-end.

## Remaining — Phase 5b (language-services regex→tree migration)

**Deferred, not done.** This is Tier 4 in the audit: **IDE-UX severity, not
compiler correctness or security.** These regexes are best-effort source-text
probes for editor features (type inference, completion, semantic tokens,
rename) that degrade a hint on a miss rather than corrupting compiled output.
They duplicate what the Lezer tree + `scope-analysis.ts` already model.

Priority order (each an independent commit; regex fallbacks stay as safety nets):

1. **Structured diagnostic codes** — add `code?`/`data?` to `Diagnostic`
   (`types.ts`); `code-actions.ts:48` matches `diag.code` instead of
   `/^Undefined variable: (\w+)$/`; `diagnostics.ts:58,69` reads structured
   `line`/`column` off a `PathogenError` instead of regex-parsing its own
   message string.
2. **`inlay-hints.ts:38-42`** — derive params from structured `SIGNATURE_DATA`,
   not a regex over the generated `detail` string.
3. **`type-inference.ts:127-296`** (~20 dynamic `new RegExp(\`let\\s+…\`)`
   probes) — add a tree-first path via a `scope-analysis.ts` `Declaration`
   initializer node; migrate rule-by-rule with hover/completion tests green.
4. **`completion.ts:449-480`** — object-literal member recovery via the same
   declaration-initializer lookup.
5. **`semantic-tokens.ts:230`, `rename.ts:162`** — Lezer tree queries replace
   line-regex scans (lowest priority; cosmetic failure mode).

## Adjacent opportunities (from the audit, not scheduled)

- Differential/property-based color tests vs a browser `CanvasRenderingContext2D` oracle.
- `--viewBox` CLI validation (tiny).
- Evaluator dedup (`index.ts` vs `annotated.ts`) — the root cause of the diverging duplicate parsers; large, separate project.
- CSS-L4 color extensions (`none`, exponents, `deg`/`turn`) — user-facing, docs-first.
