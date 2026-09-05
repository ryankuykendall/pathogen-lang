// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { INSTANCE_LIMIT_FALLBACK } from '../playground/components/shared/log-entry';
import { groupWarnLogEntries, WARNING_GROUP_INSTANCE_LIMIT } from '../src/evaluator/warning-groups';

// The console pane groups warning mirrors by family through the library
// global (window.PathogenLang.groupWarnLogEntries): one row per family with a
// ×N chip that expands to the individual instances, capped at the library's
// instance limit. Without the global (storybook, tests) it renders one row
// per entry as before.

interface LogEntryLike {
  line: number | null;
  severity?: 'warn';
  parts: { type: 'string'; value: string }[];
}
const warn = (line: number, message: string): LogEntryLike => ({
  line,
  severity: 'warn',
  parts: [{ type: 'string', value: `[warn] ${message}` }],
});
const plain = (line: number, value: string): LogEntryLike => ({ line, parts: [{ type: 'string', value }] });

type ConsolePaneLike = HTMLElement & { logs: LogEntryLike[]; open: () => void };

function mount(logs: LogEntryLike[]): ConsolePaneLike {
  const el = document.createElement('console-pane') as ConsolePaneLike;
  document.body.appendChild(el);
  el.logs = logs;
  el.open();
  return el;
}

function rows(el: ConsolePaneLike): HTMLElement[] {
  return Array.from(el.shadowRoot!.querySelectorAll('log-entry'));
}

describe('console-pane warning grouping', () => {
  beforeAll(async () => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
    await import('../playground/components/console-pane.ts');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as { PathogenLang?: unknown }).PathogenLang;
  });

  it('collapses a family into one row with a count chip that expands to its instances', () => {
    (window as unknown as { PathogenLang: unknown }).PathogenLang = {
      groupWarnLogEntries,
      WARNING_GROUP_INSTANCE_LIMIT: 200,
    };
    const el = mount([
      warn(7, 'Fillet radius clamped at vertex 2: effective radius 10.00'),
      warn(7, 'Fillet skipped at vertex 2: radius too large for edge length'),
      plain(9, 'hello'),
      warn(7, 'Fillet radius clamped at vertex 0: effective radius 6.53'),
      warn(7, 'Fillet skipped at vertex 0: radius too large for edge length'),
    ]);
    const entries = rows(el);
    expect(entries).toHaveLength(3);

    const clamped = entries[0].shadowRoot!;
    const count = clamped.querySelector('.count') as HTMLElement;
    expect(count.textContent).toBe('×2');
    expect(count.getAttribute('aria-label')).toBe('2 warnings of this kind from this line — click to list them');
    expect(clamped.querySelector('.chip')!.textContent).toBe('warn');
    expect(clamped.textContent).toContain('Fillet radius clamped at vertex 2');
    expect(clamped.querySelectorAll('.instance')).toHaveLength(0);

    count.click();
    const instances = Array.from(clamped.querySelectorAll('.instance')).map((n) => n.textContent);
    expect(instances).toEqual([
      'Fillet radius clamped at vertex 2: effective radius 10.00',
      'Fillet radius clamped at vertex 0: effective radius 6.53',
    ]);
    count.click();
    expect((clamped.querySelector('.instances') as HTMLElement).hidden).toBe(true);

    // the plain log() row keeps its place and has no count chip
    expect(entries[2].shadowRoot!.querySelector('.count')).toBeNull();
    expect(entries[2].shadowRoot!.textContent).toContain('hello');
  });

  it('caps the expanded instances at the library limit with a trailer', () => {
    (window as unknown as { PathogenLang: unknown }).PathogenLang = {
      groupWarnLogEntries,
      WARNING_GROUP_INSTANCE_LIMIT: 3,
    };
    const el = mount(
      Array.from({ length: 5 }, (_, i) => warn(3, `Fillet skipped at vertex ${i}: radius too large for edge length`)),
    );
    const only = rows(el)[0].shadowRoot!;
    expect(only.querySelector('.count')!.textContent).toBe('×5');
    (only.querySelector('.count') as HTMLElement).click();
    expect(only.querySelectorAll('.instance')).toHaveLength(3);
    expect(only.querySelector('.more')!.textContent).toContain('2 more');
  });

  it('keeps the fallback instance limit equal to the library constant', () => {
    expect(INSTANCE_LIMIT_FALLBACK).toBe(WARNING_GROUP_INSTANCE_LIMIT);
  });

  it('renders one row per entry when the library global is unavailable', () => {
    const el = mount(
      Array.from({ length: 4 }, (_, i) => warn(3, `Fillet skipped at vertex ${i}: radius too large for edge length`)),
    );
    expect(rows(el)).toHaveLength(4);
    expect(rows(el)[0].shadowRoot!.querySelector('.count')).toBeNull();
  });
});
