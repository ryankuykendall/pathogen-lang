// @vitest-environment jsdom
//
// Your Workspaces page and a workspace with no program (2d, step 9a; mockup
// v7 screen X, state 5; docs/workspace-files.md "When the main is gone or
// can't draw"). The listing's
// `noPrograms` flag puts a "No programs" label on the card, in both the grid
// and the list, and its menu's Make Public waits and says why. Make Private
// never waits.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('the Workspaces page with a workspace that has no program', () => {
  beforeAll(() => {
    // landing-view pulls in services/api.ts, which reads a build-time define.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ workspaces: [], currentUser: null });
    document.body.innerHTML = '';
  });

  async function mount() {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/views/landing-view.ts');
    // Not the landing route, so mounting doesn't fetch the list: the test sets it.
    store.update({
      currentView: 'workspace',
      currentUser: { id: 'u-1', features: ['publishing'] } as never,
      workspaces: [
        { id: 'empty', slug: 'empty', name: 'My Gears', noPrograms: true },
        { id: 'drawing', slug: 'drawing', name: 'Spirals' },
        { id: 'public-empty', slug: 'public-empty', name: 'Old Gears', isPublic: true, noPrograms: true },
      ],
    });
    const el = document.createElement('landing-view') as HTMLElement & { render(): void; viewMode: string };
    document.body.appendChild(el);
    el.render();
    const card = (id: string) => el.shadowRoot!.querySelector<HTMLElement>(`.workspace-item[data-id="${id}"]`)!;
    const publish = (id: string) => card(id).querySelector<HTMLButtonElement>('[data-action="toggle-publish"]')!;
    return { el, card, publish };
  }

  it('labels the card "No programs", in the grid and in the list', async () => {
    const { el, card } = await mount();
    const label = (id: string) => card(id).querySelector('.no-programs-badge')?.textContent ?? null;
    expect([label('empty'), label('drawing'), label('public-empty')]).toEqual(['No programs', null, 'No programs']);
    el.viewMode = 'list';
    el.render();
    expect([label('empty'), label('drawing')]).toEqual(['No programs', null]);
  });

  it('holds back Make Public, saying why; Make Private still works', async () => {
    const { publish } = await mount();
    expect([publish('empty').disabled, publish('empty').querySelector('small')?.textContent]).toEqual([
      true,
      "Add a program first: there's nothing to show",
    ]);
    expect([publish('drawing').textContent, publish('drawing').disabled]).toEqual(['Make Public', false]);
    expect([publish('public-empty').textContent, publish('public-empty').disabled]).toEqual(['Make Private', false]);
  });
});
