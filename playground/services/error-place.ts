// Where a compile failed, as a program's row in the chip's list says it
// (2d, step 5b; mockup v6 screen G: "Error in parts/gears.pathogen line 9").
//
// Read from the compile's own message, which already names the file where
// it failed: "Line 2, col 9: …" is the program's own line; "parts/gears.pathogen
// line 7, col 10: …" is another file's. getDiagnostics would place it the same
// way, but it runs the evaluator again on the main thread, which the programs
// compiled in the background must never do (note 52, step 5b).

/** The file where a compile failed, and its line when the message gives one. */
export interface ErrorPlace {
  /** A workspace path, without a leading slash. */
  file: string;
  line: number | null;
}

/**
 * Where `program`'s compile failed, from the first line of its message. The
 * lines after it ("called from …", "imported from …") lead back to the
 * program, so the first is where it failed. A message with no position (a
 * font that can't load) places it in the program, with no line.
 */
export function errorPlace(message: string, program: string): ErrorPlace {
  const first = message.split('\n', 1)[0];
  const own = /^(?:Line|Parse error at line) (\d+)/.exec(first);
  if (own) return { file: program, line: Number(own[1]) };
  const other = /^(.+?\.pathogen) line (\d+)/.exec(first);
  if (other) return { file: other[1].replace(/^\/+/, ''), line: Number(other[2]) };
  return { file: program, line: null };
}

/** The row's line: "Error in parts/gears.pathogen line 9". */
export function errorRowText(place: ErrorPlace): string {
  return place.line === null ? `Error in ${place.file}` : `Error in ${place.file} line ${place.line}`;
}
