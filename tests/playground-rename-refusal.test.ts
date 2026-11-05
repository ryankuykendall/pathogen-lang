// @vitest-environment jsdom
/**
 * F2 in the playground on a name other files share (phase 1a step 6b part 4;
 * docs/modules.md "In each tool"). A workspace can't import, but a module
 * workspace exports names, and F2 on one must say why it can't rename rather
 * than doing nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runRename } from '../playground/utils/cm-language-services';
import { getRenameEdits, prepareRename, renameRefusal, StringTextDocument } from '../src';

/** The part of window.PathogenLang that runRename uses. */
const PathogenLang = { getRenameEdits, prepareRename, renameRefusal, StringTextDocument };

/** The slice of a CodeMirror view runRename reads, with the cursor at `head`. */
function viewAt(source: string, head: number) {
  const dispatched: unknown[] = [];
  return {
    state: { doc: { toString: () => source, length: source.length }, selection: { main: { head } } },
    dispatch: (transaction: unknown) => dispatched.push(transaction),
    dispatched,
  };
}

describe('F2 in the playground', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('on an exported name: says why, asks nothing, edits nothing', () => {
    (window as unknown as { PathogenLang: typeof PathogenLang }).PathogenLang = PathogenLang;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('cog');
    const source = 'module;\nexport fn gear(size) {\n  circle(0, 0, size);\n}\n';
    const view = viewAt(source, source.indexOf('gear') + 1);
    expect(runRename(view)).toBe(true);
    expect(alert).toHaveBeenCalledWith(
      "gear is exported, so other files may use it. Renaming across files isn't supported yet: rename it in each file.",
    );
    expect(prompt).not.toHaveBeenCalled();
    expect(view.dispatched).toEqual([]);
  });

  it('on a name only this file has: asks for the new name and renames', () => {
    (window as unknown as { PathogenLang: typeof PathogenLang }).PathogenLang = PathogenLang;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockReturnValue('width');
    const source = 'let size = 2;\nlog(size);\n';
    const view = viewAt(source, 5);
    expect(runRename(view)).toBe(true);
    expect(alert).not.toHaveBeenCalled();
    expect(view.dispatched).toHaveLength(1);
  });
});
