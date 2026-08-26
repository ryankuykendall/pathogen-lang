import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getCodeActions } from '../../src/language-services/code-actions';
import { getDiagnostics } from '../../src/language-services/diagnostics';

function actionsFor(source: string) {
  const doc = new StringTextDocument(source);
  const diagnostics = getDiagnostics(doc);
  if (diagnostics.length === 0) return [];
  const range = diagnostics[0].range;
  return getCodeActions(doc, range, diagnostics);
}

describe('getCodeActions', () => {
  describe('missing semicolon', () => {
    it('offers fix for missing semicolon after let', () => {
      const actions = actionsFor('let x = 10');
      const fix = actions.find((a) => a.title.includes("';'"));
      expect(fix).toBeDefined();
      expect(fix!.edit.changes).toHaveLength(1);
      expect(fix!.edit.changes[0].newText).toBe(';');
    });

    it('inserts semicolon at end of line', () => {
      const actions = actionsFor('let x = 10');
      const fix = actions.find((a) => a.title.includes("';'"));
      expect(fix!.edit.changes[0].range.start.character).toBe(10);
    });
  });

  describe('undefined variable suggestions', () => {
    it('suggests closest match for typo', () => {
      const actions = actionsFor('M polrPoint 0');
      const suggestion = actions.find((a) => a.title.includes('polarPoint'));
      expect(suggestion).toBeDefined();
    });

    it('suggests circle for circl typo', () => {
      const actions = actionsFor('circl(50, 50, 25);');
      const suggestion = actions.find((a) => a.title.includes('circle'));
      expect(suggestion).toBeDefined();
    });

    it('suggests lerp for lrp typo', () => {
      const actions = actionsFor('let x = lrp(0, 100, 0.5);');
      const suggestion = actions.find((a) => a.title.includes('lerp'));
      expect(suggestion).toBeDefined();
    });

    it('suggests user-defined variables', () => {
      const actions = actionsFor('let radius = 50;\ncircle(0, 0, radiu);');
      const suggestion = actions.find((a) => a.title.includes('radius'));
      expect(suggestion).toBeDefined();
    });

    it('replaces the typo with the suggestion', () => {
      const actions = actionsFor('M polrPoint 0');
      const suggestion = actions.find((a) => a.title.includes('polarPoint'));
      expect(suggestion).toBeDefined();
      expect(suggestion!.edit.changes[0].newText).toBe('polarPoint');
    });

    it('returns no suggestions for completely unrelated names', () => {
      const actions = actionsFor('M xyzzy123 0');
      const suggestions = actions.filter((a) => a.title.includes('Did you mean'));
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('no actions for valid code', () => {
    it('returns empty for valid program', () => {
      expect(actionsFor('M 10 20')).toHaveLength(0);
    });
  });
});

describe('command-letter shadowing quick fix', () => {
  it('offers Wrap in calc() and no longer offers the wrong add-semicolon fix', () => {
    const doc = new StringTextDocument('let m = 25;\nM 10 10\nL m 40');
    const diags = getDiagnostics(doc);
    const actions = getCodeActions(doc, diags[0].range, diags);
    const wrap = actions.find((a) => a.title.includes('calc(m)'));
    expect(wrap).toBeDefined();
    expect(actions.find((a) => a.title.includes("';'"))).toBeUndefined();
    const edit = wrap!.edit!.changes[0];
    expect(edit.newText).toBe('calc(m)');
    expect(edit.range.start).toEqual({ line: 2, character: 2 });
    expect(edit.range.end).toEqual({ line: 2, character: 3 });
  });
});
