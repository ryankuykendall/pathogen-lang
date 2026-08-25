# Item F — approved amendments (2026-08-25)

User approved the v1 design (summary.md) with four amendments arising
from the delimiter discussion:

1. **Namespace delimiter is `.` (not `:`).** Seams stamp as
   `cut.valley`. `:` stays untouched — deliberately reserved for
   possible future CSS-like pseudo-selectors
   (`segment('cut.my-label:last')`), which generalize beyond cut
   (`segment('rim:first')`). Grammar partition:
   `name ('.' name)* (':' pseudo)*`.
2. **Authoring-time label validation ships with F.** `as segment(...)`
   / `as endpoint(...)` names must be identifier-shaped: letters,
   digits, `-`, `_`, starting with a letter. `.`, `:`, whitespace, and
   all other punctuation → compile error naming the rule. Coverage-
   matrix test enumerates the punctuation class (per
   generalize-reported-gaps), not just the two delimiters.
3. **`'cut'` is reserved as an authored label** → compile error.
   Probe (2026-08-25) proved the live trap: a subject edge hand-labeled
   'cut' silently fuses with stamped seams into one indistinguishable
   run.
4. **Query-side stays lenient** — any string queryable, unknown labels
   behave as today ([] / listed-available error). Only authoring is
   constrained.

Probe results recorded from the discussion (current HEAD, pre-F):
- Only label validation anywhere: "must be a non-empty string".
- `':weird'`, `'has.dot'`, `'a:b:c'`, `'  spaced  '` all silently
  accepted and exact-match queryable.
- Hand-authored `'cut'` on a subject: piece came back with ONE merged
  'cut' run (authored outline + healed seam fused).

Breaking-change note: 2–3 are technically breaking (labels were opaque
strings); gated on a sweep proving no published sample or test authors
punctuation/'cut' labels.
