// Where a compile failed, read once for everything that shows it (2d, steps
// 5b and 7): the chip's rows ("Error in parts/gears.pathogen line 9", mockup
// v6 screen G), the error panel (each error under the name of the file where
// it happened, with the steps back to the program: v6 screen E), the editor's
// marks in whichever file is open, and the tree's red dots.
//
// A failure is read from the compile's own message, which already names the
// file where it failed ("Line 2, col 9: …" is the program's own line;
// "parts/gears.pathogen line 7, col 10: …" is another file's), or from
// getDiagnostics, which also says where the program reaches it. The programs
// compiled in the background read only the message: getDiagnostics runs the
// evaluator again on the main thread, which they must never do (step 5b).

/** The file where a compile failed, and its line when the message gives one. */
export interface ErrorPlace {
  /** A workspace path, without a leading slash. */
  file: string;
  line: number | null;
}

/** A step back from where it happened to the program: a call, or an import. */
export interface ErrorStep {
  kind: 'called from' | 'imported from';
  /** A workspace path. */
  file: string;
  line: number;
}

/** One error of a failure, read. */
export interface ErrorReading {
  /** Where it happened: a workspace path. */
  file: string;
  line: number | null;
  column: number | null;
  /** Its words, without the place. */
  text: string;
  /** The steps back to the program, as the message lists them. */
  steps: ErrorStep[];
  /** Where the program reaches it (the call or the import) when it happened in another file; else null. */
  site: { line: number; column: number } | null;
}

/** A diagnostic, as getDiagnostics gives it (0-based positions; `alsoIn.file` a project path). */
export interface DiagnosticLike {
  range: { start: { line: number; character: number } };
  /** 1 an error, 2 a warning (LSP's numbers); left out, an error. */
  severity?: number;
  message: string;
  alsoIn?: { file: string; range: { start: { line: number; character: number } }; message: string };
}

const OWN_RUNTIME = /^Line (\d+)(?:, col (\d+))?: ?([\s\S]*)$/;
const OWN_PARSE = /^Parse error at line (\d+), column (\d+): ?([\s\S]*)$/;
// Only .pathogen files import, so the steps back name only them.
const STEP = /^\s+(called from|imported from) (.+?\.pathogen) line (\d+)\s*$/;

/**
 * The patterns for an error in another file: a .pathogen file, or a data
 * file with a JSON mistake (`data/gears.json line 3, col 3: expected …`).
 * The data extensions are the engine's own list, so a kind added later (3b's
 * .csv) is read without a change here.
 */
let filePatterns: { key: string; other: RegExp; fileOnly: RegExp } | null = null;
function patterns(): { other: RegExp; fileOnly: RegExp } {
  const lib = typeof window === 'undefined' ? undefined : window.PathogenLang;
  const data = lib?.DATA_EXTENSIONS ?? [];
  const key = data.join(' ');
  if (filePatterns?.key !== key) {
    const extensions = ['.pathogen', ...data].map((e) => e.slice(1).replace(/[^a-z0-9]/gi, '')).join('|');
    filePatterns = {
      key,
      // A workspace path has no spaces (its name rules), so words before ".pathogen line" aren't a file.
      other: new RegExp(`^(\\S+?\\.(?:${extensions})) line (\\d+)(?:, col (\\d+))?: ?([\\s\\S]*)$`, 'i'),
      // A file with no line: errorText's own words for an error with no place in it ("main.pathogen: …").
      fileOnly: new RegExp(`^(\\S+?\\.(?:${extensions})): ([\\s\\S]*)$`, 'i'),
    };
  }
  return filePatterns;
}

/** A path as the workspace names it: project paths (`/parts/gears.pathogen`) lose their slash. */
const workspacePath = (path: string): string => path.replace(/^\/+/, '');

/** The lines after an error's first: its steps back, and any other words. */
function readRest(lines: readonly string[]): { steps: ErrorStep[]; more: string[] } {
  const steps: ErrorStep[] = [];
  const more: string[] = [];
  for (const line of lines) {
    const step = STEP.exec(line);
    if (step) steps.push({ kind: step[1] as ErrorStep['kind'], file: workspacePath(step[2]), line: Number(step[3]) });
    else more.push(line.trim());
  }
  return { steps, more };
}

/** The program's line that its steps end on: where it reaches another file's error (its column unknown). */
function siteFromSteps(steps: readonly ErrorStep[], program: string): ErrorReading['site'] {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].file === program) return { line: steps[i].line, column: 1 };
  }
  return null;
}

/** One error's lines (its first, then its indented ones), read. */
function readOne(lines: readonly string[], program: string): ErrorReading {
  const [first, ...rest] = lines;
  const { steps, more } = readRest(rest);
  const words = (head: string): string => [head, ...more].filter((s) => s !== '').join('\n');
  const own = OWN_RUNTIME.exec(first) ?? OWN_PARSE.exec(first);
  if (own) {
    return {
      file: program,
      line: Number(own[1]),
      column: own[2] !== undefined ? Number(own[2]) : null,
      text: words(own[3]),
      steps,
      site: null,
    };
  }
  const other = patterns().other.exec(first);
  if (other) {
    const file = workspacePath(other[1]);
    return {
      file,
      line: Number(other[2]),
      column: other[3] !== undefined ? Number(other[3]) : null,
      text: words(other[4]),
      steps,
      site: file === program ? null : siteFromSteps(steps, program),
    };
  }
  const fileOnly = patterns().fileOnly.exec(first);
  if (fileOnly) {
    const file = workspacePath(fileOnly[1]);
    return { file, line: null, column: null, text: words(fileOnly[2]), steps, site: null };
  }
  return { file: program, line: null, column: null, text: words(first), steps, site: null };
}

/** Whether a line starts an error: it names a place ("Line 2, col 9:", "parts/gears.pathogen line 7:", a parse error's). */
const startsError = (line: string): boolean =>
  OWN_RUNTIME.test(line) || OWN_PARSE.test(line) || patterns().other.test(line) || patterns().fileOnly.test(line);

/**
 * Read a compile's message: one reading for each error in it (a message can
 * hold several imports that can't load). An error starts on a line that
 * names its place; the lines after it, up to the next such line, are its
 * steps back and any more of its words. An empty message has none.
 */
export function readMessage(message: string, program: string): ErrorReading[] {
  const errors: string[][] = [];
  for (const line of message.split('\n')) {
    if (errors.length === 0 || startsError(line)) {
      if (line.trim() !== '' || errors.length > 0) errors.push([line]);
    } else {
      errors.at(-1)!.push(line);
    }
  }
  return errors.map((lines) => readOne(lines, program));
}

/**
 * Read getDiagnostics' errors for `program`. An error a call caused in another
 * file says where (`alsoIn`); one in another file's own code names that file
 * in its first line. Either way the diagnostic's own place is where the
 * program reaches it. A warning isn't read: it's an underline in the editor,
 * never one of the panel's errors (a data key no item has, phase 3a).
 */
export function readDiagnostics(diagnostics: readonly DiagnosticLike[], program: string): ErrorReading[] {
  return diagnostics.filter((d) => d.severity === undefined || d.severity === 1).map((d) => {
    const at = { line: d.range.start.line + 1, column: d.range.start.character + 1 };
    if (d.alsoIn) {
      const [first, ...rest] = d.alsoIn.message.split('\n');
      const { steps, more } = readRest(rest);
      const file = workspacePath(d.alsoIn.file);
      return {
        file,
        line: d.alsoIn.range.start.line + 1,
        column: d.alsoIn.range.start.character + 1,
        text: [first, ...more].filter((s) => s !== '').join('\n'),
        steps,
        site: file === program ? null : at,
      };
    }
    const reading = readOne(d.message.split('\n'), program);
    if (reading.file !== program) return { ...reading, site: at };
    // The program's own error: the diagnostic's place, which a message without a column lacks.
    return { ...reading, line: at.line, column: at.column };
  });
}

/** Where `program`'s compile failed: the first error's file and line (its row in the chip's list). */
export function errorPlace(message: string, program: string): ErrorPlace {
  const [first] = readMessage(message, program);
  return { file: first.file, line: first.line };
}

/** The row's line: "Error in parts/gears.pathogen line 9". */
export function errorRowText(place: ErrorPlace): string {
  return place.line === null ? `Error in ${place.file}` : `Error in ${place.file} line ${place.line}`;
}

/**
 * The places to mark in `file`, the file open in the editor: where an error
 * happened, each step back through it, and, in the program, where it reaches
 * an error in another file. Each place once.
 */
export function errorMarks(
  readings: readonly ErrorReading[],
  file: string,
  program: string,
): { line: number; column: number }[] {
  const marks = new Map<string, { line: number; column: number }>();
  const mark = (line: number, column: number): void => {
    marks.set(`${line}:${column}`, { line, column });
  };
  for (const r of readings) {
    if (r.file === file && r.line !== null) mark(r.line, r.column ?? 1);
    // The program's site has the column a step lacks.
    if (file === program && r.file !== program && r.site) mark(r.site.line, r.site.column);
    for (const step of r.steps) {
      if (step.file === file && !(file === program && r.site)) mark(step.line, 1);
    }
  }
  return [...marks.values()];
}

/** The errors as plain words (Copy Debug Info, the status): each with its file and place, then its steps. */
export function errorText(readings: readonly ErrorReading[]): string {
  return readings
    .map((r) => {
      let place = r.file;
      if (r.line !== null) place += ` line ${r.line}`;
      if (r.line !== null && r.column !== null) place += `, col ${r.column}`;
      return [`${place}: ${r.text}`, ...r.steps.map((s) => `  ${s.kind} ${s.file} line ${s.line}`)].join('\n');
    })
    .join('\n');
}
