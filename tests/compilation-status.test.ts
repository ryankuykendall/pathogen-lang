import { describe, expect, it } from 'vitest';

import { compilationStatusView, formatElapsedClock } from '../playground/utils/compilation-status';

// The status→text/class map drives three surfaces (breadcrumb bar, the
// preview pane's fullscreen chip, the storybook header). Pin the contract so
// a change is deliberate everywhere at once.

describe('formatElapsedClock', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1000, '00:01'],
    [59_999, '00:59'],
    [60_000, '01:00'],
    [754_000, '12:34'],
    [3_600_000, '60:00'],
    [6_000_000, '100:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatElapsedClock(ms)).toBe(expected);
  });

  it.each([[-1], [NaN], [Infinity], [-Infinity]])('clamps %s to 00:00', (ms) => {
    expect(formatElapsedClock(ms)).toBe('00:00');
  });
});

describe('compilationStatusView', () => {
  it.each([
    ['compiling', 'Compiling... 00:00', 'compiling'],
    ['rendering', 'Rendering...', 'rendering'],
    ['completed', 'Ready', 'completed'],
    ['error', 'Error', 'error'],
    ['cancelled', 'Cancelled', 'cancelled'],
  ] as const)('%s → "%s" / .%s', (status, text, className) => {
    expect(compilationStatusView(status)).toEqual({ text, className });
  });

  it('puts the elapsed clock on the compiling chip only', () => {
    expect(compilationStatusView('compiling', 61_000)).toEqual({ text: 'Compiling... 01:01', className: 'compiling' });
    expect(compilationStatusView('rendering', 61_000).text).toBe('Rendering...');
    expect(compilationStatusView('completed', 61_000).text).toBe('Ready');
    expect(compilationStatusView('error', 61_000).text).toBe('Error');
    expect(compilationStatusView('cancelled', 61_000).text).toBe('Cancelled');
  });

  it.each([['idle'], [null], [''], ['bogus-status']])('hides for %j', (status) => {
    expect(compilationStatusView(status)).toEqual({ text: '', className: 'hidden' });
  });

  // 2d, step 9a (mockup v11; your answer 2026-11-12, "'No programs' should be fine"): a
  // workspace with no program draws nothing, and the status says so, explaining itself on hover.
  it('no programs: "No programs", saying why on hover', () => {
    expect(compilationStatusView('no-programs')).toEqual({
      text: 'No programs',
      className: 'no-programs',
      title: 'Nothing draws: the workspace has no program. Add one with the + in the Files header.',
    });
  });
});
