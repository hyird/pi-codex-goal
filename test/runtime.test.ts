import { test, expect } from "bun:test";
import { Type } from "typebox";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, InMemoryCredentialStore, type AssistantMessage, type StreamFunction, type ToolCall } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import extension from "../src/index.ts";
import { CONTROL_TYPE, STATE_TYPE, emptyState, parseState, type State } from "../src/state.ts";

const objective = "OBJECTIVE_STATE_ONLY_中文_790f";
type Step = { text?: string; tool?: string; args?: ToolCall["arguments"]; error?: string; empty?: boolean; aborted?: boolean; before?: (session: AgentSession) => Promise<void> };
function response(model: Parameters<StreamFunction>[0], step: Step, call: number): ReturnType<StreamFunction> {
  const stream = createAssistantMessageEventStream();
  const content: AssistantMessage["content"] = step.tool
    ? [{ type: "toolCall", id: `call-${call}`, name: step.tool, arguments: step.args ?? {} }]
    : step.empty || step.error ? [] : [{ type: "text", text: step.text ?? "Done" }];
  const stopReason = step.aborted ? "aborted" : step.error ? "error" : step.tool ? "toolUse" : "stop";
  const message: AssistantMessage = { role: "assistant", content, api: model.api, provider: model.provider, model: model.id,
    // Seven cached-read tokens are excluded from Codex's goal budget.
    usage: { input: 10, output: 1, cacheRead: 7, cacheWrite: 0, totalTokens: 18,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason, timestamp: Date.now(), ...(step.error ? { errorMessage: step.error } : {}) };
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    if (step.error || step.aborted) stream.push({ type: "error", reason: step.aborted ? "aborted" : "error", error: message });
    else stream.push({ type: "done", reason: stopReason as "stop" | "toolUse", message });
    stream.end();
  });
  return stream;
}
async function harness(steps: Step[], work: (h: {
  session: AgentSession; state(): State; run(text: string): Promise<void>;
  requests: Parameters<StreamFunction>[1][]; notices: string[];
}) => Promise<void>, initial?: State, retry = false) {
  const dir = mkdtempSync(join(tmpdir(), "pi-goal-fresh-"));
  const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false, credentials: new InMemoryCredentialStore(), modelsPath: null });
  modelRuntime.registerProvider("goal-test", { apiKey: "test" });
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: retry, maxRetries: 1, baseDelayMs: 1 } });
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, settingsManager: settings, noContextFiles: true,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, extensionFactories: [extension, pi => {
      pi.registerTool({ name: "fail_execution", label: "Test failure", description: "Test fixture",
        parameters: Type.Object({}), async execute() { throw Error("Execution unavailable"); } });
    }] });
  await loader.reload();
  const sessionManager = SessionManager.inMemory(dir);
  if (initial) sessionManager.appendCustomEntry(STATE_TYPE, initial);
  const { session } = await createAgentSession({ cwd: dir, agentDir: dir, resourceLoader: loader, modelRuntime,
    sessionManager, settingsManager: settings, noTools: "builtin",
    model: { provider: "goal-test", id: "test", name: "test", api: "openai-completions", baseUrl: "http://localhost",
      reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1000 } });
  const requests: Parameters<StreamFunction>[1][] = [];
  const notices: string[] = [];
  session.agent.streamFunction = async (model, context) => {
    requests.push(structuredClone(context));
    const step = steps[requests.length - 1];
    await step?.before?.(session);
    // Fail safely instead of letting a broken goal loop consume endless requests.
    return response(model, step ?? { error: "TEST_UNEXPECTED_CONTINUATION" }, requests.length);
  };
  try {
    await session.bindExtensions({});
    session.extensionRunner!.setUIContext({ ...session.extensionRunner!.createContext().ui,
      notify(message) { notices.push(message); }, confirm: async () => true,
    }, "tui");
    await work({ session, requests, notices,
      state() {
        let state = emptyState();
        for (const e of sessionManager.getBranch()) if (e.type === "custom" && e.customType === STATE_TYPE) state = parseState(e.data);
        return state;
      },
      async run(text) { await session.prompt(text); await session.waitForIdle(); },
    });
  } finally { session.dispose(); rmSync(dir, { recursive: true, force: true }); }
}

test("native SDK: initial objective stays in state; automatic continuation has no user input", async () => {
  await harness([
    { tool: "get_goal" }, { text: "Performed first step" },
    { tool: "get_goal" }, { tool: "update_goal", args: { status: "complete" } }, { text: "Verified" },
  ], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(5);
    expect(h.state().goal).toBeNull();
    expect(h.state().receipt?.tokensUsed).toBe(44); // calling response, but not completion epilogue
    expect(JSON.stringify(h.requests[0]!.messages)).not.toContain(objective);
    expect(JSON.stringify(h.requests[1]!.messages)).toContain(objective); // get_goal tool result
    const entries = h.session.sessionManager.getBranch();
    expect(entries.some(e => e.type === "message" && e.message.role === "user")).toBe(false);
    const controls = entries.filter(e => e.type === "custom_message" && e.customType === CONTROL_TYPE);
    expect(controls.length).toBe(2);
    for (const c of controls) { if (c.type !== "custom_message") continue; expect(c.display).toBe(false); expect(JSON.stringify(c)).not.toContain(objective); }
    // Model receives at most the latest control, not an ever-growing chain.
    for (const request of h.requests) expect(request.messages.filter(m => JSON.stringify(m).includes("Read get_goal for the current objective")).length).toBeLessThanOrEqual(1);
  });
});

test("native SDK: block persists through ordinary input; explicit resume is silent", async () => {
  await harness([
    { tool: "get_goal" }, { tool: "update_goal", args: { status: "blocked", reason: "Need decision" } }, { text: "Blocked" },
    { text: "Answering unrelated question" },
    { tool: "get_goal" }, { tool: "update_goal", args: { status: "complete" } }, { text: "Done" },
  ], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.state().goal?.status).toBe("blocked");
    await h.run("ordinary input");
    expect(h.requests.length).toBe(4);
    expect(h.state().goal?.objective).toBe(objective);
    expect(h.state().goal?.status).toBe("blocked");
    await h.run("/goal resume");
    expect(h.requests.length).toBe(7);
    expect(h.state().goal).toBeNull();
    const userMessages = h.session.sessionManager.getBranch().filter(e => e.type === "message" && e.message.role === "user");
    expect(userMessages.length).toBe(1);
    expect(JSON.stringify(userMessages)).toContain("ordinary input");
    expect(JSON.stringify(userMessages)).not.toContain("Read get_goal");
    expect(JSON.stringify(h.state())).not.toContain(objective);
  });
});

test("native SDK: exhausted provider error blocks without immediate retry loop", async () => {
  await harness([{ error: "invalid API state" }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(1);
    expect(h.state().goal?.status).toBe("blocked");
    expect(h.state().goal?.objective).toBe(objective);
    expect(h.state().goal?.reason).toContain("invalid API state");
  });
});

test("native SDK: usage limit stops and waits for explicit resume", async () => {
  await harness([{ error: "usage limit reached" }, { tool: "update_goal", args: { status: "complete" } }, { text: "Done" }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(1);
    expect(h.state().goal?.status).toBe("usageLimited");
    await h.run("/goal resume");
    expect(h.requests.length).toBe(3);
    expect(h.state().goal).toBeNull();
  });
});

test("native SDK: three empty automatic runs stop as blocked", async () => {
  await harness([{ empty: true }, { empty: true }, { empty: true }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(3);
    expect(h.state().goal?.status).toBe("blocked");
    expect(h.state().goal?.reason).toContain("连续三次");
  });
});

test("native SDK: reload of an active saved goal pauses rather than silently working", async () => {
  const { GoalStore } = await import("../src/state.ts");
  const store = new GoalStore(); store.create(objective);
  await harness([{ tool: "update_goal", args: { status: "complete" } }, { text: "Done" }], async h => {
    expect(h.state().goal?.status).toBe("paused");
    expect(h.requests.length).toBe(0);
    expect(h.state().goal?.objective).toBe(objective);
    await h.run("/goal resume");
    expect(h.state().goal).toBeNull();
    expect(h.requests.length).toBe(2);
  }, store.snapshot());
});

test("native SDK: budget emits one wrap-up request, then stops; completion is not faked", async () => {
  const { GoalStore } = await import("../src/state.ts");
  const store = new GoalStore(); store.create(objective, 10);
  await harness([{ text: "Some progress" }, { text: "Budget summary" }], async h => {
    await h.run("/goal resume");
    expect(h.state().goal?.status).toBe("budgetLimited");
    expect(h.state().goal?.tokensUsed).toBe(11);
    expect(h.state().goal?.budgetNoticeSent).toBe(true);
    expect(h.state().receipt).toBeNull();
    expect(h.requests.length).toBe(2);
    await h.run("/goal resume");
    expect(h.requests.length).toBe(2);
  }, store.snapshot());
});

test("native SDK: explicit pause and abort never clear unfinished objectives", async () => {
  await harness([{ tool: "update_goal", args: { status: "paused" } }, { text: "Paused" },
    { tool: "update_goal", args: { status: "complete" } }, { text: "Done" }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.state().goal?.status).toBe("paused");
    expect(h.state().goal?.objective).toBe(objective);
    await h.run("/goal resume");
    expect(h.state().goal).toBeNull();
    expect(h.requests.length).toBe(4);
  });
  await harness([{ aborted: true }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(1);
    expect(h.state().goal?.status).toBe("paused");
    expect(h.state().goal?.objective).toBe(objective);
  });
});

test("native SDK: host retries finish before goal error handling", async () => {
  await harness([{ error: "503 service unavailable" }, { tool: "update_goal", args: { status: "complete" } }, { text: "Done" }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(3);
    expect(h.state().goal).toBeNull();
    expect(h.state().receipt?.status).toBe("complete");
  }, undefined, true);
});

test("native SDK: three execution-failure runs are blocked", async () => {
  await harness([{ tool: "fail_execution" }, { empty: true }, { tool: "fail_execution" }, { empty: true }, { tool: "fail_execution" }, { empty: true }], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(6);
    expect(h.state().goal?.status).toBe("blocked");
    expect(h.state().goal?.reason).toContain("连续三次自动执行失败");
  });
});

test("native SDK: an old run cannot complete or charge a concurrently replaced goal", async () => {
  const replacement = "NEW_GOAL_760c";
  await harness([
    { tool: "update_goal", args: { status: "complete" }, before: async session => { await session.prompt(`/goal ${replacement}`); } },
    { text: "Old run finished" },
    { tool: "get_goal" }, { tool: "update_goal", args: { status: "complete" } }, { text: "New goal verified" },
  ], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(5);
    expect(JSON.stringify(h.requests[1]!.messages)).toContain("当前响应不属于此目标");
    expect(JSON.stringify(h.requests[3]!.messages)).toContain(replacement);
    expect(h.state().receipt?.tokensUsed).toBe(22);
    expect(h.state().goal).toBeNull();
  });
});

test("native SDK: queued real user input is handled before automatic idle work", async () => {
  await harness([
    { text: "First step", before: async session => { await session.followUp("REAL_USER_FOLLOWUP"); } },
    { tool: "update_goal", args: { status: "blocked", reason: "Wait for input" } }, { text: "Blocked" },
  ], async h => {
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(3);
    expect(JSON.stringify(h.requests[1]!.messages.at(-1))).toContain("REAL_USER_FOLLOWUP");
    const controls = h.session.sessionManager.getBranch().filter(e => e.type === "custom_message" && e.customType === CONTROL_TYPE);
    expect(controls.length).toBe(1);
    expect(h.state().goal?.status).toBe("blocked");
  });
});

test("native SDK: disabled goal tools prevent unsafe autonomous admission", async () => {
  await harness([], async h => {
    h.session.setActiveToolsByName([]);
    await h.run(`/goal ${objective}`);
    expect(h.requests.length).toBe(0);
    expect(h.state().goal?.status).toBe("blocked");
    expect(h.state().goal?.objective).toBe(objective);
    expect(h.notices.join("\n")).toContain("请启用 get_goal");
  });
});

test("native SDK: compaction removes old context, not branch-local plugin state", async () => {
  await harness([{ tool: "update_goal", args: { status: "blocked", reason: "dependency" } }, { text: "Blocked" }], async h => {
    await h.run(`/goal ${objective}`);
    const manager = h.session.sessionManager;
    const last = manager.getBranch().at(-1)!;
    manager.appendCompaction("Compacted conversation", last.id, 100);
    await h.session.extensionRunner!.emit({ type: "session_start", reason: "reload" });
    const tool = h.session.extensionRunner!.getToolDefinition("get_goal")!;
    const result = await tool.execute("inspect", {}, undefined, undefined, h.session.extensionRunner!.createToolContext("inspect", undefined));
    expect(JSON.stringify(result)).toContain(objective);
    expect(h.state().goal?.status).toBe("blocked");
    expect(h.requests.length).toBe(2);
  });
});
