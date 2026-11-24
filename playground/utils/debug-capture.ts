// Copy Debug Info: one Markdown report to paste into an issue or give to an
// assistant (docs/workspace-files.md "Copy Debug Info"; note 42's questions,
// answered 2026-11-13 in note 52, step 8). It covers the program the preview
// shows: its error with the lines around it, the other programs' errors, the
// text of the program and the files its imports reach (the error's file
// first), every other file by name, warnings and logs with their file, the
// layers and the canvas, and a short note for an assistant.
//
// buildCapture is pure; buildDebugCapture reads the store, and workspace-view
// gives it what it holds (the kept reading of the failure, the other programs'
// places, the import graph, which files are modules).

import { errorRowText, readMessage } from '../services/error-place.js';
import { isDataFile, programToShow, shownProgramText, workspaceNow } from '../services/workspace-files.js';
import { store } from '../state/store.js';
import { formatBytes, utf8Length } from './format-bytes.js';

import type { ErrorPlace, ErrorReading } from '../services/error-place.js';
import type { CompileWarning, LayerOutput, LogEntry } from '../types/compiler.js';

/**
 * Per-section cap on captured rows (layers, warnings, logs), and on each
 * file's lines. A program that fillets every glyph contour emitted ~5,000
 * warnings plus their log mirrors on 2026-09-05; the capture became a
 * 10,000-line paste that nobody could read. Each section keeps its first rows
 * and ends with a count of what was left out.
 */
export const CAPTURE_LINE_LIMIT = 200;

/** About how many lines of files the report carries in all. */
export const CAPTURE_FILES_LIMIT = 1500;

/** The lines on each side of an error's line in its excerpt. */
const EXCERPT_RADIUS = 5;

/** How many errors get an excerpt: the first ones; the rest are listed with their place. */
const EXCERPT_LIMIT = 5;

/**
 * The most characters one value takes: a layer's path data, a log's value, a
 * warning's message, an excerpt's line. One dense layer can run to megabytes.
 */
export const CAPTURE_TEXT_LIMIT = 4000;

/** `text` cut to `limit` characters, saying how many more there were. */
function clip(text: string, limit = CAPTURE_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}… (${plural(text.length - limit, 'more character')})`;
}

/** A data file in the reach comes with this many lines, unless the error is in it. */
export const CAPTURE_DATA_LINES = 20;

/** Lines of a file longer than this are cut, so a data file on one line doesn't fill the report. */
export const CAPTURE_LINE_CHARS = 200;

export interface CaptureFile {
  /** A workspace path. */
  path: string;
  text: string;
  kind: 'program' | 'module' | 'data';
}

/** A line of a file, cut at CAPTURE_LINE_CHARS with "…" where it stops. */
const cutLine = (line: string): string =>
  line.length > CAPTURE_LINE_CHARS ? `${line.slice(0, CAPTURE_LINE_CHARS)}…` : line;

export interface CaptureInput {
  timestamp: string;
  /** The workspace's name, or "unsaved". */
  workspace: string;
  /** The program the preview shows. */
  shown: string;
  openFile: string | null;
  main: string | null;
  /** Every file of the workspace (a scratch link: its one). */
  files: readonly CaptureFile[];
  /** The files the shown program's imports reach (workspace paths, itself left out); null when not known. */
  reach: readonly string[] | null;
  status: string;
  /** The shown program's failure, read (services/error-place.ts); none when it compiled. */
  readings: readonly ErrorReading[];
  /** The other programs that fail, and where (step 5b's compiles). */
  others: readonly { program: string; place: ErrorPlace }[];
  /** The playground's own notes (a main that's a module draws nothing); none usually. */
  notes?: readonly string[];
  toFixed: number | null;
  layers: readonly LayerOutput[];
  layerVisibility: Readonly<Record<string, boolean>>;
  logs: readonly LogEntry[];
  warnings: readonly CompileWarning[];
  calledFunctions: readonly string[];
  canvas: {
    width: unknown;
    height: unknown;
    background: unknown;
    gridEnabled: boolean;
    gridSize: unknown;
    gridColor: unknown;
  };
}

const plural = (n: number, one: string): string => `${n.toLocaleString('en-US')} ${one}${n === 1 ? '' : 's'}`;

/** A file's lines, as the editor numbers them. */
const linesOf = (text: string): string[] => text.split('\n');

/**
 * A code fence for `text`: three backticks, or one more than the longest run
 * in it (Pathogen's strings use backticks), so the text can't close it early.
 */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The most characters of one line an excerpt shows. */
const EXCERPT_LINE_CHARS = 300;

/**
 * A line of an excerpt: whole, or cut to EXCERPT_LINE_CHARS. The error's own
 * line is cut around its column (1-based), so a mistake far along a data file
 * written on one line still shows.
 */
function aroundColumn(text: string, column: number | null): string {
  if (text.length <= EXCERPT_LINE_CHARS || column === null || column <= EXCERPT_LINE_CHARS / 2) {
    return clip(text, EXCERPT_LINE_CHARS);
  }
  const start = Math.min(column - 1 - EXCERPT_LINE_CHARS / 2, text.length - EXCERPT_LINE_CHARS);
  const end = start + EXCERPT_LINE_CHARS;
  return `…${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/**
 * The lines around `line` (1-based) in `file`, numbered as in the file, the
 * line itself marked; or why they can't be shown: the file is gone, or the
 * line is past its end (it changed since that compile).
 */
function excerpt(file: string, text: string | undefined, line: number, column: number | null = null): string {
  if (text === undefined) return `(${file} isn't in the workspace now.)\n`;
  const all = linesOf(text);
  if (line < 1 || line > all.length) {
    return `(Line ${line} is past the end of ${file}: it has changed since that compile.)\n`;
  }
  const from = Math.max(1, line - EXCERPT_RADIUS);
  const to = Math.min(all.length, line + EXCERPT_RADIUS);
  // Numbers right-aligned to the widest in the excerpt.
  const width = Math.max(2, String(to).length);
  const rows: string[] = [];
  for (let n = from; n <= to; n++) {
    const text = aroundColumn(all[n - 1], n === line ? column : null);
    rows.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${text}`);
  }
  const body = rows.join('\n');
  const fence = fenceFor(body);
  return `${fence}\n${body}\n${fence}\n`;
}

function errorsSection(input: CaptureInput, textOf: (path: string) => string | undefined): string {
  let out = `## Errors\n**Status:** ${input.status}\n`;
  for (const note of input.notes ?? []) out += `**Note:** ${note}\n`;
  if (input.readings.length === 0) return `${out}(none in the program shown)\n`;
  for (const [i, r] of input.readings.slice(0, CAPTURE_LINE_LIMIT).entries()) {
    let place = r.file;
    if (r.line !== null) place += ` line ${r.line}`;
    if (r.line !== null && r.column !== null) place += `, col ${r.column}`;
    out += `\n### ${place}\n${clip(r.text)}\n`;
    for (const step of r.steps) out += `  ${step.kind} ${step.file} line ${step.line}\n`;
    // The first few get their lines; the rest their place, which is enough to find them.
    if (r.line !== null && i < EXCERPT_LIMIT) out += `\n${excerpt(r.file, textOf(r.file), r.line, r.column)}`;
  }
  if (input.readings.length > CAPTURE_LINE_LIMIT) {
    out += `\n… ${input.readings.length - CAPTURE_LINE_LIMIT} more errors\n`;
  }
  return out;
}

function othersSection(input: CaptureInput, textOf: (path: string) => string | undefined): string {
  if (input.others.length === 0) return '';
  let out = '## Errors in other programs\n';
  for (const [i, { program, place }] of input.others.entries()) {
    out += `\n- ${program}: ${errorRowText(place)}\n`;
    if (place.line !== null && i < EXCERPT_LIMIT) out += `\n${excerpt(place.file, textOf(place.file), place.line)}`;
  }
  return out;
}

/** The program shown and the files its imports reach, the error's file first; the others by name. */
function filesSection(input: CaptureInput): string {
  const byPath = new Map(input.files.map((f) => [f.path, f]));
  const order: string[] = [];
  const take = (path: string): void => {
    if (byPath.has(path) && !order.includes(path)) order.push(path);
  };
  for (const r of input.readings) take(r.file);
  take(input.shown);
  for (const path of input.reach ?? []) take(path);
  let out = '## Files\nThe program shown and the files its imports reach, the file where the error happened first.\n';
  let budget = CAPTURE_FILES_LIMIT;
  const errorIn = new Set(input.readings.map((r) => r.file));
  for (const path of order) {
    const file = byPath.get(path)!;
    const all = linesOf(file.text);
    const data = file.kind === 'data';
    const what = path === input.shown ? 'the program shown' : data ? 'data file' : file.kind;
    const size = data ? `${formatBytes(utf8Length(file.text))}, ` : '';
    out += `\n### ${path} (${what}, ${size}${plural(all.length, 'line')})\n`;
    // A data file shows its first lines, unless the error is in it (a JSON mistake).
    const most = data && !errorIn.has(path) ? CAPTURE_DATA_LINES : CAPTURE_LINE_LIMIT;
    const kept = Math.max(0, Math.min(all.length, most, budget));
    budget -= kept;
    if (kept > 0) {
      const body = all.slice(0, kept).map(cutLine).join('\n');
      const fence = fenceFor(body);
      out += `${fence}${data ? 'json' : 'pathogen'}\n${body}\n${fence}\n`;
    }
    if (kept < all.length) out += `…${plural(all.length - kept, 'more line')}\n`;
  }
  const rest = input.files.filter((f) => !order.includes(f.path));
  if (rest.length > 0) {
    out += '\nOther files, not included:\n';
    for (const f of rest) {
      out +=
        f.kind === 'data'
          ? `- ${f.path}: data file, ${formatBytes(utf8Length(f.text))}\n`
          : `- ${f.path}: ${f.kind}, ${plural(linesOf(f.text).length, 'line')}\n`;
    }
  }
  return out;
}

function layersSection(input: CaptureInput): string {
  const { layers, layerVisibility } = input;
  let table = '| # | Name | Type | Visible | Styles |\n|---|------|------|---------|--------|\n';
  let details = '';
  for (let i = 0; i < Math.min(layers.length, CAPTURE_LINE_LIMIT); i++) {
    const layer = layers[i];
    const visible = layerVisibility[layer.name] !== false ? 'yes' : 'no';
    const styleEntries = Object.entries(layer.styles || {});
    const styles = styleEntries.length > 0 ? styleEntries.map(([k, v]) => `${k}: ${v}`).join(', ') : '(defaults)';
    table += `| ${i} | ${layer.name} | ${layer.type} | ${visible} | ${styles} |\n`;
    details += `\n### Layer ${i}: ${layer.name} (${layer.type})\n`;
    // Each value cut to CAPTURE_TEXT_LIMIT (one dense layer can run to megabytes), in a fence it can't close.
    let body = '';
    if (layer.type === 'text' && layer.textElements) {
      body = layer.textElements
        .map((el) => `<text>${clip(el.children?.map((c: { text?: string }) => c.text || '').join('') || '')}</text>`)
        .join('\n');
    } else {
      body = clip(layer.data || '(empty)');
    }
    const fence = fenceFor(body);
    details += `${fence}\n${body}\n${fence}\n`;
  }
  if (layers.length > CAPTURE_LINE_LIMIT) {
    const omitted = layers.length - CAPTURE_LINE_LIMIT;
    table += `| … | ${omitted} more layers (${layers.length} total) | | | |\n`;
    details += `\n(… ${omitted} more layers not shown)\n`;
  }
  if (layers.length === 0) {
    table += '| - | (none) | - | - | - |\n';
    details = '\n(No layers produced)\n';
  }
  return `## Layers\n${table}${details}`;
}

function warningsSection(input: CaptureInput): string {
  const { warnings } = input;
  // One row per family (code + position + message with numbers removed), with
  // its count: the same grouping the console, CLI, and LSP use.
  const groupFn = window.PathogenLang?.groupWarnings;
  const groups: { first: CompileWarning; count: number }[] = groupFn
    ? groupFn([...warnings])
    : warnings.map((w) => ({ first: w, count: 1 }));
  const rows = groups.slice(0, CAPTURE_LINE_LIMIT).map((g) => {
    const w = g.first;
    // A warning from a file the program imports names that file.
    let where = w.line != null ? ` line ${w.line}${w.column != null ? `:${w.column}` : ''}` : '';
    if (w.file) where = ` ${w.file}${where}`;
    const times = g.count > 1 ? ` (×${g.count.toLocaleString('en-US')})` : '';
    return `- [${w.code}]${where} ${clip(w.message)}${times}`;
  });
  if (groups.length > CAPTURE_LINE_LIMIT) {
    rows.push(`- … ${groups.length - CAPTURE_LINE_LIMIT} more families (${warnings.length} warnings total)`);
  }
  return `## Warnings\n${warnings.length > 0 ? `${rows.join('\n')}\n` : '(no warnings)\n'}`;
}

function logsSection(input: CaptureInput): string {
  // Warning mirrors are listed (grouped) under Warnings; keep only real log() output here.
  const plain = input.logs.filter((entry) => entry.severity !== 'warn');
  const mirrored = input.logs.length - plain.length;
  let out = '';
  if (plain.length > 0) {
    for (const entry of plain.slice(0, CAPTURE_LINE_LIMIT)) {
      // An entry from a file the program imports names that file (step 8).
      let prefix = '';
      if (entry.line != null) prefix = entry.file ? `[${entry.file} line ${entry.line}] ` : `[line ${entry.line}] `;
      else if (entry.file) prefix = `[${entry.file}] `;
      const parts = (entry.parts || []).map((p) => clip(p.label ? `${p.label}: ${p.value}` : p.value)).join(' ');
      out += `${prefix}${parts}\n`;
    }
    if (plain.length > CAPTURE_LINE_LIMIT)
      out += `… ${plain.length - CAPTURE_LINE_LIMIT} more (${plain.length} total)\n`;
  } else if (input.status === 'error') {
    // The console shows none either: a compile that stops at an error hands back no log output.
    out = '(none: the compile stopped at the error, and keeps no log output)\n';
  } else {
    out = '(no log output)\n';
  }
  if (mirrored > 0) out += `(${mirrored} warning mirror${mirrored === 1 ? '' : 's'} omitted — see Warnings)\n`;
  const fence = fenceFor(out);
  return `## Log Output\n${fence}\n${out}${fence}\n`;
}

/**
 * The note for an assistant reading the report: how to read it and what to
 * do, and where the language is described. It names no
 * syntax, so it can't go stale as the language changes (a test keeps code out).
 */
const ASSISTANT_NOTE = `## For an assistant reading this

This report comes from Pathogen Studio, the playground for Pathogen, a language for SVG paths. A workspace holds several files: programs, which draw, and modules, which other files import. The preview shows one program at a time; the report covers that one.

To help with it:
1. Start from the error, if there is one: the file and line where it happened, then each "called from" or "imported from" line back to the program shown. The numbered lines around each error are as in the file.
2. Read the files in the order given. Other files are listed by name only.
3. With no error, compare the layers and the log output with what the user expected to see.
4. Check names and behaviour against the language reference at https://pathogen.studio/docs rather than from memory: the language changes.
5. Answer with the smallest change that fixes it: the file, the line, and the new text.

The user's question:
<!-- Replace this with your question -->
`;

export function buildCapture(input: CaptureInput): string {
  const byPath = new Map(input.files.map((f) => [f.path, f.text]));
  const textOf = (path: string): string | undefined => byPath.get(path);
  const shown = input.shown === input.main ? `${input.shown} (the main)` : input.shown;
  const canvas = input.canvas;
  const sections = [
    `# Debug Capture

**Timestamp:** ${input.timestamp}
**Workspace:** ${input.workspace}
**Program shown:** ${shown}
**File open in the editor:** ${input.openFile ?? '(none)'}

## Issue
<!-- Describe the problem you're seeing -->
`,
    errorsSection(input, textOf),
    othersSection(input, textOf),
    filesSection(input),
    `## Compilation\n**Precision (toFixed):** ${input.toFixed ?? 'off'}\n`,
    layersSection(input),
    warningsSection(input),
    logsSection(input),
    `## Canvas Settings
- Width: ${String(canvas.width)}, Height: ${String(canvas.height)}
- Background: ${String(canvas.background)}
- Grid: ${canvas.gridEnabled ? 'enabled' : 'disabled'}, ${String(canvas.gridSize)}px, ${String(canvas.gridColor)}
`,
    `## Called Functions\n${input.calledFunctions.join(', ') || 'none'}\n`,
    `---\n\n${ASSISTANT_NOTE}`,
  ];
  return sections.filter((s) => s !== '').join('\n');
}

/** What workspace-view holds that the store doesn't (step 8); each has a fallback read from the store. */
export interface CaptureContext {
  readings?: readonly ErrorReading[];
  others?: readonly { program: string; place: ErrorPlace }[];
  reach?: readonly string[] | null;
  kindOf?: (path: string, text: string) => CaptureFile['kind'];
  notes?: readonly string[];
}

/** Without workspace-view's reading: a data file by its extension, a module by its header. */
function defaultKindOf(path: string, text: string): CaptureFile['kind'] {
  if (isDataFile(path)) return 'data';
  return /^\s*module;/.test(text) ? 'module' : 'program';
}

/** The report for the workspace as it stands, read from the store and from what workspace-view gives. */
export function buildDebugCapture(context: CaptureContext = {}): string {
  const state = store.getAll();
  const workspace = workspaceNow();
  const shown = programToShow(workspace, state.shownProgram ?? null);
  const kindOf = context.kindOf ?? defaultKindOf;
  const files: CaptureFile[] = [...workspace.texts].map(([path, text]) => ({ path, text, kind: kindOf(path, text) }));
  // A scratch link holds no workspace files: its one program is what the preview shows.
  if (!workspace.texts.has(shown)) {
    files.unshift({ path: shown, text: shownProgramText() || state.code || '', kind: 'program' });
  }
  const error = state.compilationError ?? null;
  return buildCapture({
    timestamp: new Date().toISOString(),
    workspace: state.workspaceName || 'unsaved',
    shown,
    openFile: workspace.openFile,
    main: workspace.entryPoints.find((p) => workspace.texts.has(p)) ?? null,
    files,
    reach: context.reach ?? null,
    status: state.compilationStatus || 'idle',
    readings: context.readings ?? (error ? readMessage(error, shown) : []),
    others: context.others ?? [],
    notes: context.notes ?? [],
    toFixed: state.toFixed ?? null,
    layers: state.layers || [],
    layerVisibility: state.layerVisibility || {},
    logs: state.logs || [],
    warnings: state.warnings || [],
    calledFunctions: state.calledStdlibFunctions || [],
    canvas: {
      width: state.width,
      height: state.height,
      background: state.background,
      gridEnabled: Boolean(state.gridEnabled),
      gridSize: state.gridSize,
      gridColor: state.gridColor,
    },
  });
}
