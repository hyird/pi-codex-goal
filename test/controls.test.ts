import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { control, goalTokens } from "../src/index.ts";
import { GoalStore } from "../src/state.ts";

test("internal controls contain no objective and cannot populate user history", () => {
  const store = new GoalStore();
  const goal = store.create("PRIVATE_USER_OBJECTIVE_9b47");
  for (const mode of ["continue", "budget"] as const) {
    const message = control(goal, mode);
    expect(message.type).toBe("custom_message");
    expect(message.display).toBe(false);
    expect(JSON.stringify(message)).not.toContain(goal.objective);
  }
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/\bpi\.sendUserMessage\s*\(/);
  expect(source).not.toMatch(/addToHistory|pasteToEditor|setEditorText/);
});

test("Codex budget excludes cached reads, includes new cache writes, and never doubles reasoning", () => {
  expect(goalTokens({ input: 10, output: 5, cacheWrite: 3 })).toBe(18);
  expect(goalTokens({ input: -1, output: NaN, cacheWrite: Infinity })).toBe(0);
  expect(goalTokens({})).toBe(0);
});
