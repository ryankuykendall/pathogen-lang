// @vitest-environment jsdom
//
// The question an upload asks when a name is taken (phase 2d, step 6a; mockup
// v6 screen U, state 2): what it says, its three answers and "Do the same for
// the others", Escape (skip, and nothing else hears it), and withdrawing it.

import { beforeAll, describe, expect, it } from 'vitest';

import type { ClashPrompt, ClashQuestion } from '../playground/components/clash-prompt.js';

beforeAll(async () => {
  await import('../playground/components/clash-prompt.js');
});

const QUESTION: ClashQuestion = {
  name: 'labels.pathogen',
  where: 'parts/',
  keepBothName: 'labels-2.pathogen',
  others: 0,
};

function prompt(): ClashPrompt {
  document.body.innerHTML = '';
  const el = document.createElement('clash-prompt');
  document.body.appendChild(el);
  return el;
}

const $ = (el: ClashPrompt, sel: string) => el.shadowRoot!.querySelector<HTMLElement>(sel)!;

describe('the clash prompt', () => {
  it('says which name is taken where, what Keep both would call it, and starts on Keep both', async () => {
    const el = prompt();
    expect(el.hidden).toBe(true);
    const answer = el.ask(QUESTION);
    expect([el.hidden, el.isOpen]).toEqual([false, true]);
    expect($(el, '#q').textContent).toBe('labels.pathogen is already in parts/.');
    expect($(el, '#note').textContent).toBe(
      'Keep both adds it as labels-2.pathogen. The other files go in once you’ve chosen.',
    );
    expect([...el.shadowRoot!.querySelectorAll('.row button')].map((b) => b.textContent)).toEqual([
      'Replace',
      'Keep both',
      'Skip',
    ]);
    expect(el.shadowRoot!.activeElement?.textContent).toBe('Keep both');
    // One taken name: no "Do the same".
    expect($(el, '.all').hidden).toBe(true);
    $(el, '[data-choice="replace"]').click();
    expect(await answer).toEqual({ choice: 'replace', forAll: false });
    expect([el.hidden, el.isOpen]).toEqual([true, false]);
  });

  it('with more taken names, "Do the same for the others" goes with the answer', async () => {
    const el = prompt();
    const answer = el.ask({ ...QUESTION, others: 2 });
    expect($(el, '.all').hidden).toBe(false);
    expect($(el, '.all').textContent!.trim()).toBe('Do the same for the 2 other taken names');
    ($(el, '.all input') as HTMLInputElement).click();
    $(el, '[data-choice="skip"]').click();
    expect(await answer).toEqual({ choice: 'skip', forAll: true });
  });

  it('Escape skips this file, and nothing else on the page hears it', async () => {
    const el = prompt();
    let heard = 0;
    const listen = (): void => void heard++;
    document.addEventListener('keydown', listen);
    const answer = el.ask(QUESTION);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await answer).toEqual({ choice: 'skip', forAll: false });
    expect(heard).toBe(0);
    // Closed, Escape is the page's again.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(heard).toBe(1);
    document.removeEventListener('keydown', listen);
  });

  it('withdrawn (cancel, or taken off the page), its answer is null', async () => {
    const el = prompt();
    const first = el.ask(QUESTION);
    el.cancel();
    expect(await first).toBeNull();
    const second = el.ask(QUESTION);
    el.remove();
    expect(await second).toBeNull();
  });

  it('a name with markup in it is shown as text', async () => {
    const el = prompt();
    const answer = el.ask({ ...QUESTION, name: '<img src=x onerror=alert(1)>.pathogen' });
    expect([$(el, '#q b').textContent, el.shadowRoot!.querySelector('img')]).toEqual([
      '<img src=x onerror=alert(1)>.pathogen',
      null,
    ]);
    el.cancel();
    await answer;
  });
});
