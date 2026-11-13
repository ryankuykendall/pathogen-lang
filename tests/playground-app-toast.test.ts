// @vitest-environment jsdom
//
// The toast's `signal` (2d, step 4c-2): a rename's or a move's toast offers
// Undo until the next change to the files and folders, which withdraws it
// (workspace-view aborts the signal). An already-aborted signal shows nothing.

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ToastDetail } from '../playground/components/shared/app-toast.js';

type Toaster = HTMLElement & { show: (opts: ToastDetail) => void };

beforeAll(async () => {
  await import('../playground/components/shared/app-toast.js');
});

function toaster(): Toaster {
  document.body.innerHTML = '';
  const el = document.createElement('app-toast') as Toaster;
  document.body.appendChild(el);
  return el;
}

const shown = (el: Toaster) =>
  [...el.shadowRoot!.querySelectorAll<HTMLElement>('.toast')].map((t) => ({
    title: t.querySelector('.title')!.textContent,
    leaving: t.classList.contains('leaving'),
  }));

describe('a toast with a signal', () => {
  it('goes when its signal is aborted', () => {
    const el = toaster();
    const controller = new AbortController();
    el.show({ title: 'Renamed parts/ to machines/.', duration: 0, signal: controller.signal });
    el.show({ title: 'Another toast', duration: 0 });
    expect(shown(el)).toEqual([
      { title: 'Renamed parts/ to machines/.', leaving: false },
      { title: 'Another toast', leaving: false },
    ]);
    controller.abort();
    expect(shown(el)).toEqual([
      { title: 'Renamed parts/ to machines/.', leaving: true },
      { title: 'Another toast', leaving: false },
    ]);
  });

  it('is never shown when its signal was aborted already', () => {
    const el = toaster();
    const controller = new AbortController();
    controller.abort();
    el.show({ title: 'Too late', signal: controller.signal });
    expect(shown(el)).toEqual([]);
  });

  it('lists its items as text under the message, a file’s odd name included (6a)', () => {
    const el = toaster();
    el.show({
      title: 'Added springs.pathogen.',
      message: 'Not added:',
      items: ['cities.csv: workspaces hold .pathogen files for now.', '<img src=x onerror=alert(1)>.pathogen: no.'],
      duration: 0,
    });
    const items = [...el.shadowRoot!.querySelectorAll('.items li')].map((li) => li.textContent);
    expect(items).toEqual([
      'cities.csv: workspaces hold .pathogen files for now.',
      '<img src=x onerror=alert(1)>.pathogen: no.',
    ]);
    expect(el.shadowRoot!.querySelector('.items img')).toBeNull();
  });

  it('its action runs once and the toast goes', () => {
    const el = toaster();
    const onSelect = vi.fn();
    el.show({ title: 'Moved kit.pathogen', duration: 0, action: { label: 'Undo', onSelect } });
    el.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
    expect([onSelect.mock.calls.length, shown(el)[0].leaving]).toEqual([1, true]);
  });
});
