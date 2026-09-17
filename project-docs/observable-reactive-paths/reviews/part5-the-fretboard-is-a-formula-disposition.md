# Review disposition — Part 5, "The Fretboard Is a Formula" (2026-09-16)

Agentic review (content-reviewer, four personas), 19 items in five chunks. Every item
applied unless noted.

## Must-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 1 | `mm()` mis-glued negative numbers; the fanned board printed −14.54° for −13.46°. | Sign-aware helper in all six post56 samples (and synced into post55's tenths version); the fresh render reads −13.46° / 14.81°. |
| 2 | Caption called fret 1 "the nut". | "the first and last frets print their lean". |
| 3 | Sample 05 queried both octaves and then typed 323.85 and 314.33. | Notes interpolate `mm(octaveLong.start.x)` / `mm(octaveShort.start.x)`. |
| 4 | Send-off's "six evaluator and tooling fixes" did not tally. | "seven evaluator fixes and two in the tooling" (log entries 4, 12–16, 24; 19, 20). |
| 5 | Headline fence named the scale length `nut`; the subtraction was never explained. | Parameter is `scale` in the fence and all six samples; prose says what the division takes off the scale is the fret's distance from the nut. |
| 6 | "And" opener. | Split into two sentences. |
| 7 | 44-word sentence. | Split; "doubles the arithmetic". |

## Should-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 8 | Tangent sentence skipped radians. | "in radians … the lean is `deg()` of that angle, less 90". |
| 9 | "four-line helper" no longer four lines. | "Four lines became thirteen". |
| 10 | Description 184 characters. | 148-character replacement. |
| 11 | Sample 01's twin showed nothing. | The twelfth slot is drawn back in gold from the queried block. |
| 12 | Sample 05's wiggle was invisible. | Octave slot tinted on both boards from the queried blocks. |
| 13 | "Marker dots" unglossed. | Glossed as the inlays that tell a player's hand where it is. |
| 14 | Two 32-word sentences. | Second rewritten. |

## Consider
| # | Finding | Disposition |
|---|---------|-------------|
| 15 | Marker frets written twice, in two numbering systems. | Sentence added; friction entry 26 and a second friction entry in the post. |
| 16 | `mono` unused in four samples. | Removed from 01, 02, 04, 05. |
| 17 | Twelfth root of two never given its number. | "about 1.0595, the step from one semitone to the next". |
| 18 | Saddle compensation. | One clause added. |
| 19 | Same helper in post55. | Synced; part 4's friction entry says its first draft was wrong for negatives. |

Persona notes worth keeping: sample 03's 22 rotated labels at 19 px pitch is the layout the feature made possible; the send-off lands once its own post stops repeating a coordinate.
