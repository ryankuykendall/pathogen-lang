# Review disposition — Part 3, "A Linkage That Dimensions Itself" (2026-09-16)

Agentic review (content-reviewer, four personas; a first run was lost to a session
limit, the second reported 22 items in eight chunks). Every item applied unless noted.

## Must-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 1 | The crank's dimension label crossed the panel divider in 03 and 06; the area test cannot see a hairline. | 03: `dimension(link, 12)` and a smaller sideways push. 06: dimension labels print the value only (names are on the pivots), push reduced. Validator gained a divider-crossing rule (commit after 3332c6a). |
| 2 | Sample 05 draws four ghosts in the loop plus the working position separately; prose and caption said five from one loop; the 348° label sat beside the working crank. | Prose and caption say four ghosts plus the working position; labels sit on the empty side of each ghost's A; note reads "4 ghosts, one working position". |
| 3 | 06 printed "crank-rocker" from the Grashof inequality alone. | Prints `Grashof` / `non-Grashof`; the caption carries "since the shortest link is the crank, this is a crank-rocker". |
| 4 | Description 173 characters. | 136-character replacement. |
| 5 | "Four numbers" over five lines. | "Four lengths and an angle"; sample comments say "these numbers". |
| 6 | The crank angle's ground heading was a typed `0`. | `groundOut = pivotO2.command.block.tangent(1).angle + PI()` in 04 and 06; prose explains both directions come from the pivot. |
| 7 | 05's angle labels were blue. | Purple `angles` token, per the colour roles. |

## Should-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 8 | 51-word opening sentence overstating Grashof. | Split; "whether the shortest bar can turn all the way round". |
| 9 | `normal(0.5)` described as outward; "And" opener. | "the same side of every bar relative to travel, which for a loop drawn this way is the outside". |
| 10 | Second "And" opener. | "A block also cannot…". |
| 11 | "the same subscription as before" hid the narrowed selector. | "the subscription from part 2, narrowed to the two moving pivots…". |
| 12 | The trace is the arc B rides about O4, not a coupler curve. | Caption and prose say so; a real coupler curve logged as a future figure. |
| 13 | Transmission-angle rule one-sided. | "between 40 and 140 degrees, no more than 50 degrees away from square"; sample note "keep it 40°–140°". |
| 14 | Six friction entries, tooling interleaved. | Five: labels, `A`, circle-meets-circle, markers, then one merged pipeline entry (plus the divider gate). |
| 15 | Caption for 03 claimed the offset came from the bar. | "the offset is the only thing passed in". |
| 16 | Two long sentences (labels entry, part 4 teaser). | Both split. |
| 17 | Empty top band; 01's table floated away from the linkage. | Linkage lifted 20 units in 01, 02, 04; 01's table now sits level with the bars. |
| 18 | Ghost bars too heavy in 05. | Ghost stroke 1.5 → 1. |

## Consider
| # | Finding | Disposition |
|---|---------|-------------|
| 19 | Code fence lacked the sample's semicolons. | Fence mirrors the sample. (The formatter strips the `z` line's semicolon and pads it — friction 25.) |
| 20 | Taller panel geometry undocumented. | Recorded in series-design-decisions.md (dimensioned figures: 480×260, translate-y 60, notes 166; stacked boards: 480×300). |
| 21 | "The form knows" repeated; crank angle unglossed at first use. | Two repetitions varied; "measured from the ground line" at first use. |
| 22 | Validator cannot see a divider crossing. | Rule added (check 3a). |

Persona notes worth keeping: the `dimension(link, offset)` helper taking a Segment is the best API argument in the series; sample 05's "add a ghost and the rings and trace follow" is the sentence readers repeat.

## Addendum
| # | Finding | Disposition |
|---|---------|-------------|
| 23 | `n` and `p` are names the code guidelines forbid; one was in the post's fence. | `barNormal` and `pivots` in all six samples and the fence; SVGs byte-identical. |
| 14 (amended) | Friction-entry leads need not be past tense; docs links are precedent-loose. | Leads left as outcome headlines. |
