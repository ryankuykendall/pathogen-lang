/**
 * Tokenizer-based parser for CSS color FUNCTIONS (rgb/hsl/hwb/oklch/oklab/
 * lab/lch). Replaces the ladder of nine hand-rolled regexes in color.ts with
 * one scanner plus a per-function acceptance table, so each grammatical rule
 * (which component allows a sign, which requires/forbids `%`, whether the
 * legacy comma form exists, whether alpha may be a percent) is stated once and
 * unit-testable in isolation.
 *
 * This is a pure lexer: it returns structured components and does NOT apply
 * any CSS Color L4 scaling — color.ts owns that (L/alpha 100%→1, chroma
 * 100%→0.4, rgb 100%→255). Acceptance is deliberately byte-compatible with the
 * regexes it replaces; CSS-L4 extensions (none, exponents, deg/turn hue units)
 * are intentionally still rejected here and are a separate, docs-first feature.
 */

export type ColorFn = 'rgb' | 'hsl' | 'hwb' | 'oklch' | 'oklab' | 'lab' | 'lch';

export interface ColorComponent {
  value: number;
  percent: boolean;
}

export interface ParsedColorFunction {
  fn: ColorFn;
  comps: [ColorComponent, ColorComponent, ColorComponent];
  alpha?: ColorComponent;
  legacy: boolean; // comma-separated form
}

// ── Per-component acceptance rules ─────────────────────────────────────

type PercentRule = 'required' | 'optional' | 'forbidden';
interface CompRule {
  sign: boolean; // may the number carry a leading '-'/'+'?
  percent: PercentRule;
}

interface FnSpec {
  legacyAllowed: boolean; // is the comma-separated form accepted?
  comps: [CompRule, CompRule, CompRule];
  alphaPercentAllowed: boolean; // may alpha be written as a percent?
}

// Encodes exactly what the color.ts regexes accepted, component by component.
const FN_SPECS: Record<ColorFn, FnSpec> = {
  // rgb(R G B) / rgb(R, G, B): each component number or percent, no sign.
  rgb: {
    legacyAllowed: true,
    comps: [
      { sign: false, percent: 'optional' },
      { sign: false, percent: 'optional' },
      { sign: false, percent: 'optional' },
    ],
    alphaPercentAllowed: true,
  },
  // hsl(H S% L%): hue is a bare number; S and L REQUIRE a percent.
  hsl: {
    legacyAllowed: true,
    comps: [
      { sign: false, percent: 'forbidden' },
      { sign: false, percent: 'required' },
      { sign: false, percent: 'required' },
    ],
    alphaPercentAllowed: true,
  },
  // hwb(H W% B%): modern only; hue bare, W and B REQUIRE a percent.
  hwb: {
    legacyAllowed: false,
    comps: [
      { sign: false, percent: 'forbidden' },
      { sign: false, percent: 'required' },
      { sign: false, percent: 'required' },
    ],
    alphaPercentAllowed: true,
  },
  // oklch(L C H): L and C number-or-percent, hue bare.
  oklch: {
    legacyAllowed: false,
    comps: [
      { sign: false, percent: 'optional' },
      { sign: false, percent: 'optional' },
      { sign: false, percent: 'forbidden' },
    ],
    alphaPercentAllowed: true,
  },
  // oklab(L a b): L number-or-percent (no sign); a and b signed number-or-percent.
  oklab: {
    legacyAllowed: false,
    comps: [
      { sign: false, percent: 'optional' },
      { sign: true, percent: 'optional' },
      { sign: true, percent: 'optional' },
    ],
    alphaPercentAllowed: true,
  },
  // lab(L a b): L number with an OPTIONAL, ignored percent; a and b signed
  // bare numbers (no percent); alpha is a bare number (no percent).
  lab: {
    legacyAllowed: false,
    comps: [
      { sign: false, percent: 'optional' },
      { sign: true, percent: 'forbidden' },
      { sign: true, percent: 'forbidden' },
    ],
    alphaPercentAllowed: false,
  },
  // lch(L C H): L number with optional ignored percent; C and H bare numbers;
  // alpha bare number.
  lch: {
    legacyAllowed: false,
    comps: [
      { sign: false, percent: 'optional' },
      { sign: false, percent: 'forbidden' },
      { sign: false, percent: 'forbidden' },
    ],
    alphaPercentAllowed: false,
  },
};

// ── Scanner ────────────────────────────────────────────────────────────

type RawToken =
  | { kind: 'num'; value: number; percent: boolean; signed: boolean }
  | { kind: 'comma' }
  | { kind: 'slash' };

const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/**
 * Read a single number token (optional leading `-`, digits with at most one
 * dot, optional trailing `%`). Matches the `-?[\d.]+%?` shape the regexes used
 * — notably NO exponent (`1e2` rejected) and NO unary `+` (neither was
 * accepted before). Returns null if the cursor is not on such a number. `pos`
 * is advanced past the token on success.
 */
export function readNumber(s: string, pos: { i: number }): { value: number; percent: boolean; signed: boolean } | null {
  let i = pos.i;
  let signed = false;
  if (s[i] === '-') {
    signed = true;
    i++;
  }
  let sawDigit = false;
  let sawDot = false;
  const bodyStart = i;
  while (i < s.length) {
    const ch = s[i];
    if (isDigit(ch)) {
      sawDigit = true;
      i++;
    } else if (ch === '.' && !sawDot) {
      sawDot = true;
      i++;
    } else {
      break;
    }
  }
  if (!sawDigit) return null;
  const magnitude = parseFloat(s.slice(bodyStart, i));
  let percent = false;
  if (s[i] === '%') {
    percent = true;
    i++;
  }
  pos.i = i;
  return { value: signed ? -magnitude : magnitude, percent, signed };
}

/** Tokenize a color-function interior into numbers, commas, and slashes. */
function scanInterior(inner: string): RawToken[] | null {
  const tokens: RawToken[] = [];
  const pos = { i: 0 };
  while (pos.i < inner.length) {
    const ch = inner[pos.i];
    if (isSpace(ch)) {
      pos.i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      pos.i++;
      continue;
    }
    if (ch === '/') {
      tokens.push({ kind: 'slash' });
      pos.i++;
      continue;
    }
    const num = readNumber(inner, pos);
    if (num === null) return null; // unexpected character
    tokens.push({ kind: 'num', value: num.value, percent: num.percent, signed: num.signed });
  }
  return tokens;
}

const FN_NAME_RE = /^(rgba?|hsla?|hwba?|oklch|oklab|lab|lch)\(([\s\S]*)\)$/;

function normalizeFnName(name: string): ColorFn {
  if (name === 'rgba') return 'rgb';
  if (name === 'hsla') return 'hsl';
  if (name === 'hwba') return 'hwb';
  return name as ColorFn;
}

function compOk(comp: RawToken & { kind: 'num' }, rule: CompRule): boolean {
  if (comp.signed && !rule.sign) return false;
  if (comp.percent && rule.percent === 'forbidden') return false;
  if (!comp.percent && rule.percent === 'required') return false;
  return true;
}

/**
 * Parse a CSS color function string into structured components, or return null
 * if the input is not a recognized, well-formed color function. Never throws.
 * The input is expected pre-trimmed and lowercased (parseColor does this).
 */
export function parseColorFunction(input: string): ParsedColorFunction | null {
  const m = FN_NAME_RE.exec(input);
  if (!m) return null;
  const fn = normalizeFnName(m[1]);
  const spec = FN_SPECS[fn];

  const tokens = scanInterior(m[2]);
  if (tokens === null) return null;

  const nums = tokens.filter((t): t is RawToken & { kind: 'num' } => t.kind === 'num');
  const hasComma = tokens.some((t) => t.kind === 'comma');
  const hasSlash = tokens.some((t) => t.kind === 'slash');

  // Separator style: commas → legacy, slash (or neither) → modern. Mixing the
  // two is invalid.
  if (hasComma && hasSlash) return null;
  const legacy = hasComma;
  if (legacy && !spec.legacyAllowed) return null;

  // Component/alpha count: 3 components, optional alpha.
  if (nums.length < 3 || nums.length > 4) return null;
  const hasAlpha = nums.length === 4;

  // Separator placement must match the form exactly. Reconstruct the expected
  // token sequence and compare.
  const expected: ('num' | 'comma' | 'slash')[] = [];
  for (let k = 0; k < nums.length; k++) {
    if (k > 0) {
      if (legacy) expected.push('comma');
      else if (k === 3) expected.push('slash'); // alpha delimiter in modern form
      // modern components 1-2 separated by whitespace only (no token)
    }
    expected.push('num');
  }
  const actual = tokens.map((t) => t.kind);
  if (actual.length !== expected.length || actual.some((k, idx) => k !== expected[idx])) {
    return null;
  }

  // Validate each component against the per-function rule.
  for (let k = 0; k < 3; k++) {
    if (!compOk(nums[k], spec.comps[k])) return null;
  }
  if (hasAlpha) {
    const alpha = nums[3];
    if (alpha.signed) return null; // alpha is never signed in the regexes
    if (alpha.percent && !spec.alphaPercentAllowed) return null;
  }

  const comps: [ColorComponent, ColorComponent, ColorComponent] = [
    { value: nums[0].value, percent: nums[0].percent },
    { value: nums[1].value, percent: nums[1].percent },
    { value: nums[2].value, percent: nums[2].percent },
  ];
  const result: ParsedColorFunction = { fn, comps, legacy };
  if (hasAlpha) result.alpha = { value: nums[3].value, percent: nums[3].percent };
  return result;
}
