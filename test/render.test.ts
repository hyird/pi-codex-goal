import { test, expect } from "bun:test";
import type { TUI } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { initTheme, SessionManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { FooterComponent } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js";
import { ToolExecutionComponent } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js";
import { quietGoalRenderers } from "../src/render.ts";
import { GoalStore } from "../src/state.ts";
import { formatGoalStatus, GOAL_STATUS_KEY } from "../src/status.ts";

test.each(["get_goal", "create_goal", "update_goal"])("native TUI: %s stays invisible throughout execution", name => {
  const ui = { requestRender() {} } as TUI;
  const row = new ToolExecutionComponent(name, "goal-call", {}, {}, quietGoalRenderers, ui, process.cwd());
  expect(row.render(80)).toEqual([]);
  row.markExecutionStarted(); row.setArgsComplete();
  expect(row.render(80)).toEqual([]);
  row.updateResult({ content: [{ type: "text", text: '{"objective":"private goal","status":"active"}' }], isError: false }, true);
  expect(row.render(80)).toEqual([]);
  row.updateResult({ content: [{ type: "text", text: "internal management error" }], isError: true });
  row.setExpanded(true); row.invalidate();
  expect(row.render(80)).toEqual([]);
});

test("native TUI: goal duration leads the shared footer before OMP and DCP", () => {
  initTheme("dark", false);
  const store = new GoalStore();
  const goal = store.create("objective", 1_000_000);
  store.account(goal.id, 664812, 754_000);
  const text = formatGoalStatus(store.snapshot(), undefined)!;
  const footer = new FooterComponent({
    sessionManager: SessionManager.inMemory(process.cwd()), state: {}, getContextUsage: () => undefined,
  } as unknown as AgentSession, {
    getGitBranch: () => null, getAvailableProviderCount: () => 1, onBranchChange: () => () => {},
    getExtensionStatuses: () => new Map([
      ["1:omp", "OMP:orchestrator"], ["dcp", "DCP: ~683"], [GOAL_STATUS_KEY, text],
    ]),
  });
  const line = stripVTControlCharacters(footer.render(120)[2]!);
  expect(line).toBe(`${text} OMP:orchestrator DCP: ~683`);
  expect(stripVTControlCharacters(footer.render(64)[2]!)).toStartWith(text);
});
