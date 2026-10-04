import { expect, test } from "bun:test";
import { GoalStore, emptyState } from "../src/state.ts";
import { formatDuration, formatGoalStatus } from "../src/status.ts";

const theme = { fg: (_color: string, text: string) => text };

test("duration remains readable across minute and hour boundaries", () => {
  expect(formatDuration(59_999)).toBe("59s");
  expect(formatDuration(60_000)).toBe("1m 00s");
  expect(formatDuration(3_723_000)).toBe("1h 02m 03s");
});

test("footer shows the live duration and budget without changing exact accounting", () => {
  const store = new GoalStore();
  const goal = store.create("private objective", 1_000_000);
  store.account(goal.id, 664812, 753_000);
  const state = store.snapshot();
  expect(formatGoalStatus(state, theme, 1000)).toBe("Goal ● Active · 664.8K / 1M tokens · 12m 34s");
  expect(state).toEqual(store.snapshot());
  expect(state.goal?.tokensUsed).toBe(664812);
  expect(state.goal?.activeMs).toBe(753_000);
  store.transition(goal.id, "paused");
  expect(formatGoalStatus(store.snapshot(), theme, 60_000)).toBe("Goal ● Paused · 664.8K / 1M tokens · 12m 33s");
  store.transition(goal.id, "active");
  store.complete(goal.id);
  expect(formatGoalStatus(store.snapshot(), theme, 60_000)).toBe("Goal ✓ Complete · 664.8K tokens · 12m 33s");
  expect(formatGoalStatus(emptyState(), theme)).toBeUndefined();
});

test("limit statuses use readable labels and stop the live clock", () => {
  const store = new GoalStore();
  const goal = store.create("objective", 1000);
  store.account(goal.id, 1000, 1000);
  expect(formatGoalStatus(store.snapshot(), theme, 60_000)).toBe("Goal ● Budget reached · 1K / 1K tokens · 1s");
  store.clear();
  const next = store.create("objective");
  store.transition(next.id, "usageLimited", "quota");
  expect(formatGoalStatus(store.snapshot(), theme, 60_000)).toBe("Goal ● Usage limit · 0 tokens · 0s");
});
