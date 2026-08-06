// Human-readable byte size, 1000-based so the number matches what Finder /
// Explorer report for the downloaded file.

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
