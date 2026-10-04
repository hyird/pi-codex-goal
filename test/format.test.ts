import { test, expect } from "bun:test";
import { formatTokenCount } from "../src/format.ts";

test.each([
  { tokens: 0, expected: "0" },
  { tokens: 999, expected: "999" },
  { tokens: 1000, expected: "1K" },
  { tokens: 1050, expected: "1.1K" },
  { tokens: 664812, expected: "664.8K" },
  { tokens: 999949, expected: "999.9K" },
  { tokens: 999950, expected: "1M" },
  { tokens: 1000000, expected: "1M" },
  { tokens: 1234567, expected: "1.2M" },
  { tokens: 1000000000, expected: "1B" },
  { tokens: 1234567890, expected: "1.2B" },
  { tokens: 1000000000000, expected: "1T" },
  { tokens: 1234567890123, expected: "1.2T" },
  { tokens: Number.MAX_SAFE_INTEGER, expected: "9007.2T" },
])("compact tokens: $tokens -> $expected", ({ tokens, expected }) => {
  expect(formatTokenCount(tokens)).toBe(expected);
});

test("display formatter handles invalid values without changing persisted data", () => {
  for (const tokens of [-1, NaN, Infinity]) expect(formatTokenCount(tokens)).toBe("0");
  expect(formatTokenCount(1234.9)).toBe("1.2K");
});
