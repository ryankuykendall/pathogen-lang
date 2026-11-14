# Debug Capture

**Timestamp:** 2026-11-14T00:25:18.475Z
**Workspace:** 8 debug capture
**Program shown:** main.pathogen (the main)
**File open in the editor:** main.pathogen

## Issue
<!-- Describe the problem you're seeing -->

## Errors
**Status:** error

### parts/gears.pathogen line 5, col 3
assertion failed: a gear needs at least 3 teeth
  called from main.pathogen line 4

```
   1 | module;
   2 | 
   3 | export fn gear(center, radius, teeth) {
   4 |   log(teeth);
>  5 |   assert(teeth >= 3, 'a gear needs at least 3 teeth');
   6 |   circle(center.x, center.y, radius);
   7 | }
   8 | 
```

## Errors in other programs

- try-sizes.pathogen: Error in try-sizes.pathogen line 3

```
   1 | define ViewBox(0, 0, 200, 100);
   2 | let r = 12;
>  3 | circle(60, nope, r);
   4 | 
```

## Files
The program shown and the files its imports reach, the file where the error happened first.

### parts/gears.pathogen (module, 8 lines)
```pathogen
module;

export fn gear(center, radius, teeth) {
  log(teeth);
  assert(teeth >= 3, 'a gear needs at least 3 teeth');
  circle(center.x, center.y, radius);
}

```

### main.pathogen (the program shown, 5 lines)
```pathogen
import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);
gear(Point(55, 50), 40, 2);

```

Other files, not included:
- parts/labels.pathogen: module, 4 lines
- try-sizes.pathogen: program, 4 lines

## Compilation
**Precision (toFixed):** off

## Layers
| # | Name | Type | Visible | Styles |
|---|------|------|---------|--------|
| - | (none) | - | - | - |

(No layers produced)

## Warnings
(no warnings)

## Log Output
```
(none: the compile stopped at the error, and keeps no log output)
```

## Canvas Settings
- Width: 200, Height: 200
- Background: #f5f5f5
- Grid: enabled, 20px, #cccccc

## Called Functions
none

---

## For an assistant reading this

This report comes from Pathogen Studio, the playground for Pathogen, a language for SVG paths. A workspace holds several files: programs, which draw, and modules, which other files import. The preview shows one program at a time; the report covers that one.

To help with it:
1. Start from the error, if there is one: the file and line where it happened, then each "called from" or "imported from" line back to the program shown. The numbered lines around each error are as in the file.
2. Read the files in the order given. Other files are listed by name only.
3. With no error, compare the layers and the log output with what the user expected to see.
4. Check names and behaviour against the language reference at https://pathogen.studio/docs rather than from memory: the language changes.
5. Answer with the smallest change that fixes it: the file, the line, and the new text.

The user's question:
<!-- Replace this with your question -->
