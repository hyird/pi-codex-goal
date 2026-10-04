import { test, expect } from "bun:test";
import type { TUI } from "@earendil-works/pi-tui";
import { ToolExecutionComponent } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js";
import { quietGoalRenderers } from "../src/render.ts";

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
