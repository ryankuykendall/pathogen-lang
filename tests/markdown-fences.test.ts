import { describe, expect, it } from 'vitest';

import { fenceAt, isPathogenFence, markdownFences } from '../scripts/lib/markdown-fences';

describe('markdownFences', () => {
  it('returns each fence with its lower-cased info string, first body line and body', () => {
    const text = ['# Title', '', '```Pathogen', 'M 0 0', 'L 1 1', '```', 'prose', '```', 'circle(1, 1, 1);', '```'].join(
      '\n',
    );
    expect(markdownFences(text)).toEqual([
      { info: 'pathogen', line: 4, body: 'M 0 0\nL 1 1' },
      { info: '', line: 9, body: 'circle(1, 1, 1);' },
    ]);
  });

  it('closes a fence only with the same character at least as long', () => {
    const text = ['~~~~', '```', 'inner', '~~~', '~~~~', 'after'].join('\n');
    expect(markdownFences(text)).toEqual([{ info: '', line: 2, body: '```\ninner\n~~~' }]);
  });

  it('runs an unclosed fence to the end of the file', () => {
    expect(markdownFences('```js\nlet a = 1;')).toEqual([{ info: 'js', line: 2, body: 'let a = 1;' }]);
  });

  it('fenceAt reports the body span the codemod splices', () => {
    const lines = ['x', '```pathogen', 'a', 'b', '```'];
    expect(fenceAt(lines, 0)).toBeNull();
    expect(fenceAt(lines, 1)).toEqual({ info: 'pathogen', bodyStart: 2, bodyEnd: 4 });
  });

  it('treats bare and pathogen fences as Pathogen, others not', () => {
    expect(['', 'pathogen', 'js', 'bash'].map(isPathogenFence)).toEqual([true, true, false, false]);
  });
});
