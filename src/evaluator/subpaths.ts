/**
 * The SVG subpath rule, in one place.
 *
 * A subpath starts at the first command, at every moveto, and at the first
 * drawing command after a closepath that is not followed by a moveto (SVG
 * implicitly reopens at the closed subpath's start). It is `closed` when its
 * last command is a closepath.
 *
 * Shared by `subPathCount`, `.contours`, and the `subpath` query noun. The
 * corner-op finalizer in segments.ts keeps its historical move-only split so
 * emit stays byte-stable — see the comment there.
 */
import type { PathBlockCommand } from './types';

export interface SubpathSpan {
  from: number; // first command index (inclusive)
  to: number; // last command index (exclusive)
  closed: boolean;
}

const isMove = (c: string) => c === 'm' || c === 'M';
const isClose = (c: string) => c === 'z' || c === 'Z';

export function splitSubpaths(commands: PathBlockCommand[]): SubpathSpan[] {
  const spans: SubpathSpan[] = [];
  if (commands.length === 0) return spans;
  let from = 0;
  for (let i = 1; i < commands.length; i++) {
    const startsNew = isMove(commands[i].command) || (isClose(commands[i - 1].command) && !isMove(commands[i].command));
    if (startsNew) {
      spans.push({ from, to: i, closed: isClose(commands[i - 1].command) });
      from = i;
    }
  }
  spans.push({ from, to: commands.length, closed: isClose(commands[commands.length - 1].command) });
  return spans;
}

/** The same split as command arrays, for callers that rebuild blocks per subpath. */
export function splitSubpathCommands(commands: PathBlockCommand[]): PathBlockCommand[][] {
  return splitSubpaths(commands).map((s) => commands.slice(s.from, s.to));
}

/** Index of the subpath each command belongs to, aligned with `commands`. */
export function subpathIndexOf(commands: PathBlockCommand[], spans: SubpathSpan[] = splitSubpaths(commands)): number[] {
  const out = new Array<number>(commands.length);
  spans.forEach((s, k) => {
    for (let i = s.from; i < s.to; i++) out[i] = k;
  });
  return out;
}
