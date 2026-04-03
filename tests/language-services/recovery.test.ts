import { describe, it, expect } from 'vitest';
import { parseWithRecovery } from '../../src/language-services/recovery';

describe('parseWithRecovery', () => {
  it('returns AST and no errors for valid source', () => {
    const result = parseWithRecovery('let x = 10;\nM x 0');
    expect(result.ast).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('returns null AST and errors for invalid source', () => {
    const result = parseWithRecovery('let x = 10');
    expect(result.ast).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('collects multiple errors from distinct statements', () => {
    const source = [
      'let x = 10',     // missing semicolon
      'M 0 0',          // recovery point
      'let y = 20',     // missing semicolon
      'M 5 5',          // recovery point
    ].join('\n');
    const result = parseWithRecovery(source);
    expect(result.ast).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('includes sourceLineOffset for recovered errors', () => {
    const source = [
      'let x = 10',     // error at offset 0
      'M 0 0',          // recovery at line 1
      'let y = 20',     // error at offset 1 (relative to sub-parse from line 1)
      'M 5 5',          // recovery
    ].join('\n');
    const result = parseWithRecovery(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    // First error has offset 0 (full source parse)
    expect(result.errors[0].sourceLineOffset).toBe(0);
    // Second error has offset > 0 (sub-parse started later)
    expect(result.errors[1].sourceLineOffset).toBeGreaterThan(0);
  });

  it('stops after MAX_RECOVERY_ATTEMPTS', () => {
    // Create a source with many errors — recovery should not loop forever
    const lines = [];
    for (let i = 0; i < 20; i++) {
      lines.push('let x = ');
      lines.push('M 0 0');
    }
    const result = parseWithRecovery(lines.join('\n'));
    // Should have some errors but not hang
    expect(result.errors.length).toBeLessThanOrEqual(10);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    const result = parseWithRecovery('');
    expect(result.ast).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('handles single valid statement', () => {
    const result = parseWithRecovery('M 10 20');
    expect(result.ast).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });
});
