// Number formatting for toFixed post-processing
// Module-level state is safe because evaluation is synchronous

let _fmt: (n: number) => string = String;

export function formatNum(n: number): string {
  return _fmt(n);
}

export function setNumberFormat(toFixed?: number | null): void {
  if (toFixed != null) {
    _fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(toFixed));
  } else {
    _fmt = String;
  }
}

export function resetNumberFormat(): void {
  _fmt = String;
}
