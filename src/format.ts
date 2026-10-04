const tokenFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

/** Display only: preserve exact integer counts in plugin state and tool results. */
export function formatTokenCount(tokens: number): string {
  return tokenFormatter.format(Number.isFinite(tokens) ? Math.max(0, Math.trunc(tokens)) : 0);
}
