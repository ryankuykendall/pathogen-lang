# Placement & coordinate-space audit

**Date:** 2026-09-24 · **Status:** findings, not decisions · **Prompted by:** ISSUE-025

Ryan's read, which started this:

> we don't have a very strong or consistent narrative around how projection, subpath
> cutting, draw vs. drawTo all work (in terms of principles) because the feature set has
> evolved organically … it seems like we should do an audit in order to distill what we
> have, and then where we should go.

That read is correct. This is the distillation.

## What is here

| File | What it holds |
|---|---|
| `01-spaces.md` | The six coordinate spaces, their conversions, and the edges with no conversion |
| `02-surface-matrix.md` | Every producer → result type, where the origin lands, and whether position is **recoverable** |
| `03-principles.md` | The model we should have had, argued from the grain that already exists |
| `04-violations.md` | Every operation graded against those principles, ranked, each with a fix and its cost |
| `05-defects.md` | Nine measured bugs, triaged for `known-issues.md` |
| `06-vocabulary.md` | One name per concept, and the synonyms it replaces |
| `probes/` | The evidence. Re-runnable. |

## How to re-run the evidence

```bash
bash project-docs/placement-audit/probes/run-probes.sh
```

It compiles one tiny program per case — so a method that throws is recorded as a result
rather than killing the run — and prints the matrix in `02-surface-matrix.md`. Cases live in
`probes/cases.tsv`; add a row to extend it.

**Every claim in `01`, `02` and `05` comes from a probe unless it is labelled a source read.**
`probes/run-defects.sh` covers D1–D4, D6, D7 and ISSUE-015; D5 and D9 are source reads and
say so; D8 was probed by hand (recorded in `02`). `06-vocabulary.md` is a reading of the
published docs, not a measurement.

Probing rather than reading is deliberate: the one prior record of this matrix
(`project-docs/glyph-halo-diagnosis/STATUS.md:87`, 2026-09-12) is **already stale** — it
lists `offset()` as re-origining a positioned block, and `offset()` keeps the frame today.
A hand-maintained matrix of this surface goes wrong within weeks.

## The three-sentence version

The mental model is "a block is local, a projection is page". The code has **six** spaces,
only one of which has a named conversion, and **five** different answers to "where does the
result land". Underneath both: **position is encoded as the presence or absence of a first
command rather than as data** — so a block that carries a leading `m` is cursor-dependent
(the cut-piece shift), and a block that lacks one serializes to invalid SVG (every `<defs>`
producer, ISSUE-015). Two opposite failures, one representation choice.

## What this does NOT do

It does not fix anything. It ranks and costs. Nine defects are written up in `05-defects.md`
ready to become `known-issues.md` entries; four of them are user-visible breakage rather
than design debt.

**Revised 2026-09-24 after review.** The first draft claimed a single root cause, and its own
evidence contradicted it — a *positioned* block appends to a mask **validly**
(`M 0 0 H 40 V 40 H 0 Z`); it is the *absence* of the leading move that produces invalid SVG.
`03-principles.md` now names two opposite causes. `04-violations.md`'s order changed with it:
V2's cost was wrong (`anchor` is already declared), so V4 goes first on severity.
