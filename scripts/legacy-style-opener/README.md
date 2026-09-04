# Frozen pre-`#{` grammar

`pathogen-legacy.grammar` is a byte copy of `src/parser/pathogen.grammar` as of
commit `fe78555` (2026-09-03), before the style-block opener changed from `${`
to `#{`, minus the `@external propSource` line (highlighting is irrelevant to
the codemod). `scripts/lib/legacy-style-opener.ts` builds a parser from it at
runtime with `@lezer/generator` so the migration keeps working after the live
grammar flips.

Delete this directory after the production KV migration
(`scripts/migrate-style-opener-kv.ts`) has been run twice and confirmed. It
is the only thing in the repository that still understands the old opener.
