/**
 * Fenced code blocks in Markdown, as the docs and blog builds see them: an
 * opening run of three or more backticks or tildes, an optional info string,
 * and a closing run of the same character at least as long.
 *
 * Shared by the style-opener codemod (scripts/lib/legacy-style-opener.ts) and
 * the semantics audit (scripts/audit-semantics.ts), so both agree on what a
 * fence is.
 */

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)/;

export interface FenceAt {
  /** Lower-cased info string ('' for a bare fence). */
  info: string;
  /** Index of the first body line. */
  bodyStart: number;
  /** Index one past the last body line (the closing fence, or lines.length when unclosed). */
  bodyEnd: number;
}

/** The fence that opens at `lines[i]`, or null when that line opens none. */
export function fenceAt(lines: readonly string[], i: number): FenceAt | null {
  const open = FENCE_OPEN.exec(lines[i]);
  if (!open) return null;
  const fenceChar = open[2][0];
  const fenceLen = open[2].length;
  const closeRe = new RegExp(`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`);
  let j = i + 1;
  while (j < lines.length && !closeRe.test(lines[j])) j++;
  return { info: open[3].toLowerCase(), bodyStart: i + 1, bodyEnd: j };
}

export interface MarkdownFence {
  info: string;
  /** 1-based line number of the first body line. */
  line: number;
  body: string;
}

/** Every fenced block in `text`, in order. */
export function markdownFences(text: string): MarkdownFence[] {
  const lines = text.split('\n');
  const fences: MarkdownFence[] = [];
  let i = 0;
  while (i < lines.length) {
    const fence = fenceAt(lines, i);
    if (!fence) {
      i++;
      continue;
    }
    fences.push({
      info: fence.info,
      line: fence.bodyStart + 1,
      body: lines.slice(fence.bodyStart, fence.bodyEnd).join('\n'),
    });
    i = fence.bodyEnd + 1;
  }
  return fences;
}

/** A fence holds Pathogen when its info string is empty or `pathogen`. */
export function isPathogenFence(info: string): boolean {
  return info === '' || info === 'pathogen';
}
