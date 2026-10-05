import { describe, test, expect } from "bun:test";
import { GoalStore, emptyState, parseState } from "../src/state.ts";

function fixture() {
  let now = 1000;
  const store = new GoalStore(() => now);
  return { store, tick(ms: number) { now += ms; } };
}
describe("persistent goal state", () => {
  test("starts active and stores objective outside conversation", () => {
    const { store } = fixture();
    const g = store.create("  构建并验证功能  ");
    expect(g.status).toBe("active");
    expect(g.objective).toBe("构建并验证功能");
    expect(store.snapshot().receipt).toBeNull();
  });
  test("rejects empty/oversized objectives and invalid budgets", () => {
    for (const value of ["", "  ", "🐈".repeat(8001)]) expect(() => new GoalStore().create(value)).toThrow();
    expect(new GoalStore().create("🐈".repeat(8000)).objective.length).toBe(16000);
    for (const budget of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => new GoalStore().create("x", budget)).toThrow();
  });
  test("unfinished goal needs explicit replacement; IDs prevent stale writes", () => {
    const { store } = fixture();
    const a = store.create("a");
    expect(() => store.create("b")).toThrow();
    const b = store.create("b", null, true);
    expect(b.id).not.toBe(a.id);
    store.account(a.id, 100, 100);
    expect(store.snapshot().goal?.tokensUsed).toBe(0);
    expect(() => store.complete(a.id)).toThrow();
    expect(() => store.transition(a.id, "paused")).toThrow();
  });
  test("pause/block/usage stop retain objective and restore from saved state", () => {
    for (const status of ["paused", "blocked", "usageLimited"] as const) {
      const { store } = fixture();
      const g = store.create("keep this");
      store.transition(g.id, status, "dependency");
      const restored = new GoalStore();
      restored.restore(store.snapshot());
      expect(restored.snapshot().goal?.objective).toBe("keep this");
      expect(() => restored.complete(g.id)).toThrow();
      restored.transition(g.id, "active");
      expect(restored.snapshot().goal?.reason).toBeNull();
    }
  });
  test("block requires reason; ordinary input has no state transition", () => {
    const { store } = fixture();
    const g = store.create("x");
    expect(() => store.transition(g.id, "blocked")).toThrow();
    expect(() => store.transition(g.id, "blocked", "  ")).toThrow();
    expect(() => store.transition(g.id, "active")).toThrow();
  });
  test("budget crossing stops work and cannot be bypassed by resume", () => {
    const { store } = fixture();
    const g = store.create("x", 10);
    store.account(g.id, 8, 23);
    store.account(g.id, 2, 5);
    expect(store.snapshot().goal?.status).toBe("budgetLimited");
    expect(store.snapshot().goal?.activeMs).toBe(28);
    expect(() => store.transition(g.id, "active")).toThrow();
    store.account(g.id, 100, 100);
    expect(store.snapshot().goal?.tokensUsed).toBe(10);
  });
  test("continuous goals cannot be completed by finishing one cycle", () => {
    const { store } = fixture();
    const goal = store.create("不断打磨ruvia-http 优化性能 修复bug");
    store.account(goal.id, 100, 30);
    const before = store.snapshot();
    expect(goal.continuous).toBe(true);
    expect(() => store.complete(goal.id)).toThrow("持续目标");
    expect(store.snapshot()).toEqual(before);
    expect(store.snapshot().goal?.status).toBe("active");
    expect(store.snapshot().receipt).toBeNull();
  });
  test("ongoing wording cannot be cleared by budget or completion", () => {
    const { store } = fixture();
    const goal = store.create("Keep maintaining this project", 10);
    expect(goal.continuous).toBe(true);
    store.account(goal.id, 10, 20);
    expect(store.snapshot().goal?.status).toBe("budgetLimited");
    expect(() => store.complete(goal.id)).toThrow("持续目标");
    expect(store.snapshot().goal?.objective).toBe("Keep maintaining this project");
    expect(store.snapshot().receipt).toBeNull();
    store.clear(); // Explicit user clear remains available.
    expect(store.snapshot()).toEqual(emptyState());
  });
  test("legacy snapshots recognize ongoing intent without losing accounting", () => {
    for (const objective of ["不断打磨ruvia-http 优化性能 修复bug", "实现功能并验证"]) {
      const { store } = fixture();
      const goal = store.create(objective);
      store.account(goal.id, 100, 30);
      const snapshot = store.snapshot();
      const { continuous: _continuous, ...legacyGoal } = snapshot.goal!;
      const restored = new GoalStore();
      restored.restore({ ...snapshot, goal: legacyGoal });
      expect(restored.snapshot().goal).toEqual({ ...snapshot.goal!, continuous: objective.startsWith("不断") });
      expect(legacyGoal).not.toHaveProperty("continuous");
      if (objective.startsWith("不断")) expect(() => restored.complete(goal.id)).toThrow("持续目标");
      else expect(restored.complete(goal.id).tokensUsed).toBe(100);
    }
  });
  test("invalid continuous flags are rejected rather than coerced", () => {
    const { store } = fixture(); store.create("finite objective");
    const snapshot = store.snapshot();
    for (const continuous of [null, "false", 1, {}]) {
      expect(() => parseState({ ...snapshot, goal: { ...snapshot.goal!, continuous } })).toThrow("目标状态损坏");
    }
  });
  test("completion clears objective but preserves idempotent usage receipt", () => {
    const { store } = fixture();
    const g = store.create("sensitive objective");
    store.account(g.id, 100, 30);
    const receipt = store.complete(g.id);
    expect(store.snapshot().goal).toBeNull();
    expect(receipt.tokensUsed).toBe(100);
    expect(JSON.stringify(store.snapshot())).not.toContain("sensitive objective");
    expect(store.complete(g.id)).toEqual(receipt);
    const restored = new GoalStore(); restored.restore(store.snapshot());
    expect(restored.snapshot().receipt).toEqual(receipt);
    expect(() => restored.transition(g.id, "active")).toThrow();
    restored.create("new");
    expect(restored.snapshot().receipt).toBeNull();
  });
  test("snapshots are immutable to callers", () => {
    const { store } = fixture(); const g = store.create("x");
    g.objective = "mutated";
    const snapshot = store.snapshot(); snapshot.goal!.tokensUsed = 100;
    expect(store.snapshot().goal?.tokensUsed).toBe(0);
    expect(store.snapshot().goal?.objective).toBe("x");
  });
  test("corrupted state does not become a running goal", () => {
    expect(parseState(emptyState())).toEqual(emptyState());
    for (const bad of [undefined, null, {}, { version: 2 }, { ...emptyState(), goal: {} }, { ...emptyState(), receipt: {} }]) expect(() => parseState(bad)).toThrow();
  });
});
