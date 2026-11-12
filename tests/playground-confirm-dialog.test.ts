// @vitest-environment jsdom
//
// The confirmation dialog (2d, step 4c; mockup v7 screen F, "Deleting a
// folder"): what Delete… asks before it deletes. A promise of the answer;
// Cancel has the first focus, so Enter alone never deletes; Escape, × and
// Cancel all say no; names go in as text.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

let confirmDialog: (options: {
  title: string;
  message: string;
  items?: string[];
  warning?: string;
  confirmLabel: string;
  danger?: boolean;
}) => Promise<boolean>;

beforeAll(async () => {
  ({ confirmDialog } = await import('../playground/components/shared/confirm-dialog.js'));
});

afterEach(() => {
  document.body.innerHTML = '';
});

const root = () => document.querySelector('confirm-dialog')!.shadowRoot!;
const $ = <T extends Element = HTMLElement>(sel: string) => root().querySelector<T>(sel)!;

const FOLDER = {
  title: 'Delete parts/?',
  message: 'This deletes the folder and the 3 files in it:',
  items: ['gears.pathogen', 'kit.pathogen', 'labels.pathogen'],
  warning:
    'main.pathogen and try-sizes.pathogen import them. They’ll show an error at those imports until you change them.',
  confirmLabel: 'Delete the folder and 3 files',
  danger: true,
};

describe('the confirmation dialog', () => {
  it('says what it will do, with Cancel focused first', async () => {
    const answer = confirmDialog(FOLDER);
    expect($('h2').textContent).toBe('Delete parts/?');
    expect($('.message').textContent).toBe('This deletes the folder and the 3 files in it:');
    expect([...root().querySelectorAll('li')].map((li) => li.textContent)).toEqual(FOLDER.items);
    expect($('.warning').textContent).toBe(FOLDER.warning);
    expect([$('.confirm').textContent, $('.confirm').classList.contains('danger')]).toEqual([
      'Delete the folder and 3 files',
      true,
    ]);
    expect(root().activeElement).toBe($('.cancel'));
    expect($('dialog').getAttribute('aria-labelledby')).toBe($('h2').id);
    $('.cancel').click();
    await answer;
  });

  it('confirming says yes, and the dialog goes', async () => {
    const answer = confirmDialog(FOLDER);
    $('.confirm').click();
    expect(await answer).toBe(true);
    expect(document.querySelector('confirm-dialog')).toBeNull();
  });

  it('Cancel, × and Escape all say no', async () => {
    const closes = [
      () => $('.cancel').click(),
      () => $('.close').click(),
      () => $('dialog').dispatchEvent(new window.Event('cancel', { cancelable: true })),
    ];
    for (const close of closes) {
      const answer = confirmDialog(FOLDER);
      close();
      expect(await answer).toBe(false);
      expect(document.querySelector('confirm-dialog')).toBeNull();
    }
  });

  it('is shown modal, and closed when answered', async () => {
    const proto = window.HTMLDialogElement.prototype as HTMLDialogElement & {
      showModal: () => void;
      close: () => void;
    };
    const calls: string[] = [];
    const { showModal, close } = proto;
    proto.showModal = function stubShowModal(this: HTMLDialogElement) {
      calls.push('showModal');
      this.setAttribute('open', '');
    };
    proto.close = function stubClose(this: HTMLDialogElement) {
      calls.push('close');
      this.removeAttribute('open');
    };
    try {
      const answer = confirmDialog(FOLDER);
      $('.confirm').click();
      expect(await answer).toBe(true);
      expect(calls).toEqual(['showModal', 'close']);
    } finally {
      proto.showModal = showModal;
      proto.close = close;
    }
  });

  it('can be withdrawn by the page (it left): it says no', async () => {
    const answer = confirmDialog(FOLDER);
    document.querySelector('confirm-dialog')!.cancel();
    expect(await answer).toBe(false);
    expect(document.querySelector('confirm-dialog')).toBeNull();
  });

  it('leaves out an empty list and warning, and puts names in as text', async () => {
    const question = { title: 'Delete <b>x</b>.pathogen?', message: 'This deletes it.', confirmLabel: 'Delete' };
    const answer = confirmDialog(question);
    expect([root().querySelector('ul'), root().querySelector('.warning')]).toEqual([null, null]);
    expect($('h2').textContent).toBe('Delete <b>x</b>.pathogen?');
    expect($('h2').querySelector('b')).toBeNull();
    $('.cancel').click();
    await answer;
  });
});
