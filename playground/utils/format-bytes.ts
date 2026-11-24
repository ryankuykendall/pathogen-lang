// Human-readable byte size, 1000-based so the number matches what Finder /
// Explorer report for the downloaded file.

/** A text's length in UTF-8 bytes, as the server and a saved file count it, without encoding it. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      // A surrogate pair: one character of four bytes.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Format a byte count as `842 B`, `9.6 KB`, `128 KB`, `1.2 MB`.
 * One decimal below 10 units, integers above, trailing `.0` trimmed.
 * Returns `''` for negative or non-finite input.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  // 999,500+ would round to "1000 KB" — promote to MB instead.
  const useMb = bytes >= 999_500;
  const value = useMb ? bytes / 1_000_000 : bytes / 1000;
  const unit = useMb ? 'MB' : 'KB';
  const text = value < 9.95 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value));
  return `${text} ${unit}`;
}
