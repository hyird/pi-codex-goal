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

test("controls distinguish a completed cycle from completing a continuous goal", () => {
  const goal = new GoalStore().create("不断打磨ruvia-http 优化性能 修复bug");
  const message = control(goal);
  expect(message.content).toContain("Finishing one cycle is progress, not completion of the goal");
  expect(message.content).toContain("Never call update_goal complete for a continuous goal");
  expect(message.content).not.toContain("turn open-ended optimization into endless work");
  expect(control(goal, "budget").content).toContain("preserve a continuous goal rather than completing it");
  expect(JSON.stringify(message)).not.toContain(goal.objective);
});

test.each(["实现功能并验证全部验收要求", "不断打磨ruvia-http 优化性能 修复bug"])("controls audit the original objective rather than the current cycle: %s", objective => {
  const message = control(new GoalStore().create(objective));
  expect(message.content).toContain("Keep the full objective intact across turns");
  expect(message.content).toContain("do not redefine success around work already done");
  expect(message.content).toContain("inspect current authoritative evidence for every requirement");
  expect(message.content).toContain("Missing, uncertain or indirect evidence is not completion");
  expect(message.content).toContain("Interpret ongoing versus finite intent from the objective");
  expect(JSON.stringify(message)).not.toContain(objective);
});

test("Codex budget excludes cached reads, includes new cache writes, and never doubles reasoning", () => {
  expect(goalTokens({ input: 10, output: 5, cacheWrite: 3 })).toBe(18);
  expect(goalTokens({ input: -1, output: NaN, cacheWrite: Infinity })).toBe(0);
  expect(goalTokens({})).toBe(0);
});
