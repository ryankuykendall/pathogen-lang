import { describe, expect, it } from 'vitest';

import { compilationStatusView } from '../playground/utils/compilation-status';

// The status→text/class map drives three surfaces (breadcrumb bar, the
// preview pane's fullscreen chip, the storybook header). Pin the contract so
// a change is deliberate everywhere at once.

describe('compilationStatusView', () => {
  it.each([
    ['compiling', 'Compiling...', 'compiling'],
    ['rendering', 'Rendering...', 'rendering'],
    ['completed', 'Ready', 'completed'],
    ['error', 'Error', 'error'],
  ] as const)('%s → "%s" / .%s', (status, text, className) => {
    expect(compilationStatusView(status)).toEqual({ text, className });
  });

  it.each([['idle'], [null], [''], ['bogus-status']])(
    'hides for %j',
    (status) => {
      expect(compilationStatusView(status as string | null)).toEqual({ text: '', className: 'hidden' });
    },
  );
});
