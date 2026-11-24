/**
 * Our own JSON reader (docs/data-import.md "JSON"; project-docs/modules/
 * 76-phase-3a-build-plan.md, decision 2). JSON.parse can't keep two promises
 * the docs make: one message for a mistake on every surface (V8 and Safari
 * word theirs differently), and keys in the file's order (JS objects put keys
 * such as "2" first).
 *
 * - It builds Pathogen values directly (arrays, objects, numbers, strings,
 *   true/false, null), so a file's value exists once: the compile, the
 *   editors and a cache share it. Nothing changes it: imported values are
 *   fixed (docs/data-import.md "What you import is fixed").
 * - Objects keep their keys in a Map, so `__proto__` is a key like any other.
 * - The reader keeps its own stack, so reading deeply nested data can't
 *   overflow the call stack (what a program then does with it may recurse).
 * - A mistake says what was expected where the reading stopped, at a line and
 *   a column counted as the compiler counts them: lines split at \n, columns
 *   in UTF-16 code units from 1.
 * - A key written twice keeps its last value, at its first place, as
 *   JSON.parse does.
 * - A number too large to hold (`1e400`) is a mistake: a JSON value can't be
 *   infinite.
 */

import type { ArrayValue, BooleanValue, ObjectValue, Value } from '../evaluator/types';

/** A value read from a data file: the Pathogen values JSON maps to. */
export type DataValue = null | number | string | BooleanValue | ArrayValue | ObjectValue;

export type JsonReadResult =
  { ok: true; value: DataValue } | { ok: false; message: string; line: number; column: number; offset: number };

const QUOTE = 0x22; // "
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const MINUS = 0x2d;
const PLUS = 0x2b;
const DOT = 0x2e;
const SLASH = 0x2f;
const STAR = 0x2a;
const APOSTROPHE = 0x27;
const ZERO = 0x30;
const NINE = 0x39;
const NEWLINE = 0x0a;
const RETURN = 0x0d;
const TAB = 0x09;
const SPACE = 0x20;

/** What the reader looks for next. */
const VALUE = 0; // a value: after `:`, after `,` in an array, or the file's one value
const ARRAY_FIRST = 1; // a value or `]`, just after `[`
const OBJECT_FIRST = 2; // a key or `}`, just after `{`
const KEY = 3; // a key, after `,` in an object
const AFTER = 4; // `,` or a closing bracket, or the end of the file

type Frame = { array: ArrayValue } | { object: ObjectValue; key: string };

const NO_TRAILING_COMMA = 'JSON has no comma after the last item';
const NO_COMMENTS = "JSON can't have comments";
const ESCAPES: Readonly<Record<number, string>> = {
  [QUOTE]: '"',
  [BACKSLASH]: '\\',
  [SLASH]: '/',
  0x62: '\b',
  0x66: '\f',
  0x6e: '\n',
  0x72: '\r',
  0x74: '\t',
};

class JsonMistake {
  constructor(
    readonly offset: number,
    readonly message: string,
  ) {}
}

function isDigit(code: number): boolean {
  return code >= ZERO && code <= NINE;
}

function hexValue(code: number): number {
  if (code >= ZERO && code <= NINE) return code - ZERO;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  return -1;
}

/** Text from the file for a message, cut short so a long run can't fill it. */
function shown(text: string): string {
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

class Reader {
  private pos = 0;

  private readonly stack: Frame[] = [];

  constructor(private readonly text: string) {}

  read(): DataValue {
    const { text, stack } = this;
    let want = VALUE;
    let root: DataValue | undefined;
    // A value just read, waiting to go into its array, its object or the root.
    let value: DataValue = null;
    for (;;) {
      this.skipSpace();
      const pos = this.pos;
      const code = pos < text.length ? text.charCodeAt(pos) : -1;
      let done = false; // `value` holds a value to place
      switch (want) {
        case ARRAY_FIRST:
        case VALUE:
          // `[]`: an array closed before its first value.
          if (want === ARRAY_FIRST && code === CLOSE_BRACKET) {
            this.pos++;
            value = (stack.pop() as { array: ArrayValue }).array;
            done = true;
          } else if (code === OPEN_BRACE) {
            this.pos++;
            stack.push({ object: { type: 'ObjectValue', properties: new Map<string, Value>() }, key: '' });
            want = OBJECT_FIRST;
          } else if (code === OPEN_BRACKET) {
            this.pos++;
            stack.push({ array: { type: 'ArrayValue', elements: [] } });
            want = ARRAY_FIRST;
          } else {
            value = this.readScalar(code);
            done = true;
          }
          break;
        case OBJECT_FIRST:
        case KEY: {
          if (code === CLOSE_BRACE) {
            if (want === KEY) this.fail(`expected a key in double quotes, not }: ${NO_TRAILING_COMMA}`);
            this.pos++;
            value = (stack.pop() as { object: ObjectValue }).object;
            done = true;
            break;
          }
          if (code !== QUOTE) {
            this.failComment('expected a key in double quotes');
            this.fail('expected a key in double quotes');
          }
          const key = this.readString();
          this.skipSpace();
          if (this.code() !== COLON) this.fail(`expected : after the key ${shown(JSON.stringify(key))}`);
          this.pos++;
          (stack[stack.length - 1] as { key: string }).key = key;
          want = VALUE;
          break;
        }
        case AFTER: {
          const top = stack[stack.length - 1];
          if (!top) {
            if (code === -1) return root as DataValue;
            this.failAfter('expected the end of the file after the value');
          }
          const isArray = 'array' in top;
          const expected = isArray ? 'expected , or ] after an array item' : "expected , or } after a key's value";
          if (code === COMMA) {
            this.pos++;
            want = isArray ? VALUE : KEY;
          } else if (code === (isArray ? CLOSE_BRACKET : CLOSE_BRACE)) {
            this.pos++;
            stack.pop();
            value = isArray ? top.array : top.object;
            done = true;
          } else {
            this.failAfter(expected);
          }
          break;
        }
      }
      if (!done) continue;
      // Place the value just read.
      const top = stack[stack.length - 1];
      if (!top) root = value;
      else if ('array' in top) top.array.elements.push(value);
      else top.object.properties.set(top.key, value);
      want = AFTER;
    }
  }

  private code(): number {
    return this.pos < this.text.length ? this.text.charCodeAt(this.pos) : -1;
  }

  private fail(message: string, offset = this.pos): never {
    throw new JsonMistake(offset, message);
  }

  /** `//` or `/*` at the reading place: a comment, which JSON can't have. */
  private failComment(expected: string): void {
    const next = this.text.charCodeAt(this.pos + 1);
    if (this.code() === SLASH && (next === SLASH || next === STAR))
      this.fail(`${expected}, not a comment: ${NO_COMMENTS}`);
  }

  /** What comes after a value isn't `,` or a closing bracket. */
  private failAfter(expected: string): never {
    this.failComment(expected);
    // `01`: the number stopped at its 0 (readNumber), so the digit is here.
    const before = this.text.charCodeAt(this.pos - 1);
    if (isDigit(this.code()) && before === ZERO && !isDigit(this.text.charCodeAt(this.pos - 2))) {
      const start = this.text.charCodeAt(this.pos - 2);
      if (start !== DOT && start !== 0x65 && start !== 0x45) {
        this.fail(`${expected}, not a digit: a number can't start with 0 and another digit`);
      }
    }
    this.fail(expected);
  }

  private skipSpace(): void {
    const { text } = this;
    let pos = this.pos;
    for (;;) {
      const code = text.charCodeAt(pos);
      if (code === SPACE || code === NEWLINE || code === RETURN || code === TAB) pos++;
      else break;
    }
    this.pos = pos;
  }

  /** A string, number or word where a value goes, or the mistake there. */
  private readScalar(code: number): DataValue {
    if (code === QUOTE) return this.readString();
    if (code === MINUS || isDigit(code)) return this.readNumber();
    if (code === -1) {
      if (this.stack.length === 0) this.fail('expected a value: the file is empty');
      this.fail('expected a value');
    }
    const top = this.stack[this.stack.length - 1];
    if (code === CLOSE_BRACKET && top && 'array' in top) this.fail(`expected a value, not ]: ${NO_TRAILING_COMMA}`);
    this.failComment('expected a value');
    if (code === APOSTROPHE) this.fail("expected a value, not ': strings in JSON use double quotes");
    if (code === PLUS) this.fail("expected a value, not +: a number can't start with +");
    if (code === DOT) this.fail('expected a value, not .: a number needs a digit before its .');
    const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.text.slice(this.pos, this.pos + 64))?.[0];
    if (word === 'true' || word === 'false' || word === 'null') {
      this.pos += word.length;
      return word === 'null' ? null : { type: 'BooleanValue', value: word === 'true' ? 1 : 0 };
    }
    if (word) this.fail(`expected a value, not ${shown(word)}: JSON's words are true, false and null`);
    this.fail('expected a value');
  }

  private readNumber(): number {
    const { text } = this;
    const start = this.pos;
    let pos = start;
    if (text.charCodeAt(pos) === MINUS) {
      pos++;
      if (!isDigit(text.charCodeAt(pos))) this.fail('expected a digit after -', pos);
    }
    // A leading 0 stands alone: a digit after it is the next thing's mistake (failAfter).
    if (text.charCodeAt(pos) === ZERO) pos++;
    else while (isDigit(text.charCodeAt(pos))) pos++;
    if (text.charCodeAt(pos) === DOT) {
      pos++;
      if (!isDigit(text.charCodeAt(pos))) this.fail('expected a digit after .', pos);
      while (isDigit(text.charCodeAt(pos))) pos++;
    }
    const e = text.charCodeAt(pos);
    if (e === 0x65 || e === 0x45) {
      pos++;
      const sign = text.charCodeAt(pos);
      if (sign === PLUS || sign === MINUS) pos++;
      if (!isDigit(text.charCodeAt(pos))) this.fail('expected a digit in the exponent', pos);
      while (isDigit(text.charCodeAt(pos))) pos++;
    }
    const written = text.slice(start, pos);
    const value = Number(written);
    if (!Number.isFinite(value)) this.fail(`the number ${shown(written)} is too large`, start);
    this.pos = pos;
    return value;
  }

  /** A string from its opening quote, at `pos`, to its closing one. */
  private readString(): string {
    const { text } = this;
    let pos = this.pos + 1;
    let out = '';
    let runStart = pos;
    for (;;) {
      if (pos >= text.length) this.fail('expected " to end the string before the file ends', pos);
      const code = text.charCodeAt(pos);
      if (code === QUOTE) break;
      if (code === BACKSLASH) {
        out += text.slice(runStart, pos);
        const escape = text.charCodeAt(pos + 1);
        const simple = ESCAPES[escape];
        if (simple !== undefined) {
          out += simple;
          pos += 2;
        } else if (escape === 0x75) {
          let unit = 0;
          for (let i = 2; i < 6; i++) {
            const digit = hexValue(text.charCodeAt(pos + i));
            if (digit < 0) this.fail('expected four hex digits after \\u', pos);
            unit = unit * 16 + digit;
          }
          out += String.fromCharCode(unit);
          pos += 6;
        } else if (pos + 1 >= text.length) {
          this.fail('expected " to end the string before the file ends', pos + 1);
        } else {
          const what = String.fromCodePoint(text.codePointAt(pos + 1) ?? escape);
          this.fail(
            `\\${what} isn't an escape in JSON: write \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t or \\u followed by four hex digits`,
            pos,
          );
        }
        runStart = pos;
        continue;
      }
      if (code < SPACE) {
        if (code === NEWLINE || code === RETURN) this.fail('expected " to end the string before the line ends', pos);
        if (code === TAB) this.fail('a tab inside a string is written \\t', pos);
        this.fail(`a control character inside a string is written \\u${code.toString(16).padStart(4, '0')}`, pos);
      }
      pos++;
    }
    out += text.slice(runStart, pos);
    this.pos = pos + 1;
    return out;
  }
}

/** Read a JSON file's text: its value, or the first mistake in it. */
export function readJson(text: string): JsonReadResult {
  try {
    return { ok: true, value: new Reader(text).read() };
  } catch (caught) {
    if (!(caught instanceof JsonMistake)) throw caught;
    let line = 1;
    let lineStart = 0;
    for (let i = text.indexOf('\n'); i !== -1 && i < caught.offset; i = text.indexOf('\n', i + 1)) {
      line++;
      lineStart = i + 1;
    }
    return { ok: false, message: caught.message, line, column: caught.offset - lineStart + 1, offset: caught.offset };
  }
}
