import { createRequire } from 'module';
const req = createRequire('/Users/ryan/claude-code-projects/svg-path-extended/package.json');
const lr = req('@lezer/lr');
export const LRParser = lr.LRParser;
export const ExternalTokenizer = lr.ExternalTokenizer;
