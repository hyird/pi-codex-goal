/** Offline-only fixture for the real CLI/TUI smoke test; never installed. */
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { matchesKey } from "@earendil-works/pi-tui";
import { Type } from "typebox";

export default function (pi: ExtensionAPI): void {
  const path = process.env.GOAL_UI_AUDIT;
  if (!path) throw Error("GOAL_UI_AUDIT is required for the test fixture");
  const record = (data: unknown) => appendFileSync(path, JSON.stringify(data) + "\n");
  let calls = 0;
  pi.registerTool({ name: "work_probe", label: "work_probe", description: "Offline UI visibility probe", parameters: Type.Object({}),
    async execute() { return { content: [{ type: "text", text: "WORK_PROBE_VISIBLE" }], details: undefined }; },
  });
  pi.registerProvider("goal-ui-audit", {
    api: "openai-completions", baseUrl: "http://offline.invalid", apiKey: "offline-fixture",
    models: [{ id: "audit", name: "Offline Goal Audit", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1000 }],
    streamSimple(model) {
      calls++;
      record({ kind: "request", calls });
      const tool = calls === 1 ? "work_probe" : calls === 3 || calls === 6 ? "get_goal" : calls === 4 || calls === 7 ? "update_goal" : null;
      const content: AssistantMessage["content"] = tool ? [{ type: "toolCall", id: `audit-${calls}`, name: tool,
        arguments: tool !== "update_goal" ? {} : calls === 4 ? { status: "blocked", reason: "UI verification dependency", all_work_blocked: true } : { status: "complete" } }]
        : [{ type: "text", text: calls === 2 ? "Human-only reply" : calls === 5 ? "Blocked" : "Complete" }];
      const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: tool ? "toolUse" : "stop", timestamp: Date.now() };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => { stream.push({ type: "start", partial: message }); stream.push({ type: "done", reason: tool ? "toolUse" : "stop", message }); stream.end(); });
      return stream;
    },
  });
  let dispose: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    record({ kind: "started" });
    dispose = ctx.ui.onTerminalInput(data => {
      if (matchesKey(data, "up")) setTimeout(() => { record({ kind: "up", text: ctx.ui.getEditorText() }); }, 30);
      return undefined;
    });
  });
  pi.on("agent_settled", () => record({ kind: "settled", calls }));
  pi.on("session_shutdown", () => { dispose?.(); dispose = undefined; });
}
