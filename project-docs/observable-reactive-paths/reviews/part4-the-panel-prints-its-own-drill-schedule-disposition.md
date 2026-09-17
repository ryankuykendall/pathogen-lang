# Review disposition — Part 4, "The Panel Prints Its Own Drill Schedule" (2026-09-16)

Agentic review (content-reviewer, four personas), 19 items in seven chunks. Every item
applied unless noted.

## Must-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 1 | Sample 05 moved seven page-position lines besides `hp`; prose said nothing else changed. | "nothing about the panel is touched; the page positions shift a little"; caption: "Nothing in the panel's own definition changed." |
| 2 | The schedule footer typed `5.5 × 3.2`. | Read from `source.query('call(slot)').block.boundingBox()` in 03, 05, 06; prose says so. |
| 3 | Description 171 characters. | 144-character replacement. |
| 4 | The x column was ragged; the friction entry claimed it lined up. | Number columns are one end-anchored layer (decimal points align) beside the start-anchored footer; entry 23 and the prose now describe that. Column gaps widened after a first render fused `1` and `7.0`. |

## Should-fix
| # | Finding | Disposition |
|---|---------|-------------|
| 5 | 43-word HP sentence overstating the standard. | Split; "From 10 HP the sample adds a second pair… the way wide panels are usually mounted." |
| 6 | 60-word part 5 teaser. | Split after the scale length. |
| 7 | Sample 02's header comment said the number sits in the hole. | "just outside its rim". |
| 8 | Radius vs diameter never glossed. | Sentence after the code fence: ⌀7 pot, ⌀6 jack, ⌀3 LED. |
| 9 | `mm()` negative-number caveat dropped. | "wrong for negatives — lift it at your own risk". |
| 10 | `call(circle)` inside `drawHoles()` looked like it contradicted part 1's caveat. | Paragraph added: the apply block is the boundary; docs/path-queries.md caveat qualified. |
| 11 | Figure 06 inverts form/twin without saying so. | Sentence added. |
| 12 | Millimetre invariant carried no checkable number. | Hole 1: 15.1 in the schedule, 21.1 units on the page. |

## Consider
| # | Finding | Disposition |
|---|---------|-------------|
| 13 | Caption 01 promised counts; two lines are sizes. | Caption extended; doubled article removed. |
| 14 | `#` column in blue to match the hole numbers. | Left as-is; entry 23 stands. |
| 15 | ⌀ glyph at preview resolution. | U+2300 confirmed in the SVG; rendered by the PNG rasterizer's fallback; header keeps ⌀. |
| 16 | "Legend" unglossed. | "The legend is the printing on the panel itself". |
| 17 | 3U by value only. | "three rack units". |
| 18 | 33-word friction sentence. | Split. |
| 19 | Pot labels 0.2 mm off the arc ticks. | Offset 4.2 → 5.4 in 04 and 06. |
