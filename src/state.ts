import { randomUUID } from "node:crypto";
import { isContinuousGoal } from "./intent.ts";

export const STATE_TYPE = "pi-codex-goal/state-v1";
export const CONTROL_TYPE = "pi-codex-goal/control-v1";
export type Status = "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited";
export interface Goal {
  id: string;
  objective: string;
  continuous: boolean;
  status: Status;
  reason: string | null;
  tokenBudget: number | null;
  tokensUsed: number;
  activeMs: number;
  createdAt: number;
  updatedAt: number;
  budgetNoticeSent: boolean;
}
export interface Receipt {
  id: string;
  status: "complete";
  tokensUsed: number;
  activeMs: number;
  completedAt: number;
}
export interface State { version: 1; goal: Goal | null; receipt: Receipt | null }
export const emptyState = (): State => ({ version: 1, goal: null, receipt: null });
const clone = <T>(value: T): T => structuredClone(value);
const natural = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";

/** Reject corrupted current snapshots rather than silently resurrecting an older goal. */
export function parseState(value: unknown): State {
  if (!object(value) || value.version !== 1 || !("goal" in value) || !("receipt" in value)) throw Error("目标状态格式无效");
  const g = value.goal;
  if (g !== null && (!object(g) || typeof g.id !== "string" || !g.id || typeof g.objective !== "string" || !g.objective.trim() ||
    !["active", "paused", "blocked", "usageLimited", "budgetLimited"].includes(String(g.status)) ||
    !(g.reason === null || typeof g.reason === "string") ||
    !(g.tokenBudget === null || (natural(g.tokenBudget) && g.tokenBudget > 0)) ||
    !natural(g.tokensUsed) || !natural(g.activeMs) || !natural(g.createdAt) || !natural(g.updatedAt) || typeof g.budgetNoticeSent !== "boolean" ||
    !(g.continuous === undefined || typeof g.continuous === "boolean"))) throw Error("目标状态损坏");
  const r = value.receipt;
  if (r !== null && (!object(r) || typeof r.id !== "string" || r.status !== "complete" || !natural(r.tokensUsed) || !natural(r.activeMs) || !natural(r.completedAt))) throw Error("目标完成记录损坏");
  const state = clone(value as unknown as State);
  if (state.goal) state.goal.continuous = state.goal.continuous === true || isContinuousGoal(state.goal.objective);
  return state;
}

/** Synchronous state mutations give the Pi event loop an atomic goal-id check/write. */
export class GoalStore {
  private state: State = emptyState();
  constructor(private readonly now: () => number = Date.now) {}
  snapshot(): State { return clone(this.state); }
  restore(value: unknown): void { this.state = parseState(value); }
  clear(): void { this.state = emptyState(); }
  create(objective: string, tokenBudget: number | null = null, replace = false): Goal {
    objective = objective.trim();
    if (!objective || Array.from(objective).length > 8000) throw Error("目标须为 1–8000 个字符");
    if (tokenBudget !== null && (!natural(tokenBudget) || tokenBudget < 1)) throw Error("token_budget 须为正安全整数");
    if (this.state.goal && !replace) throw Error("已有未完成目标；请先完成，或由用户明确替换");
    const now = this.now();
    const goal: Goal = { id: randomUUID(), objective, continuous: isContinuousGoal(objective), status: "active", reason: null, tokenBudget,
      tokensUsed: 0, activeMs: 0, createdAt: now, updatedAt: now, budgetNoticeSent: false };
    this.state = { version: 1, goal, receipt: null };
    return clone(goal);
  }
  transition(id: string, status: Status, reason: string | null = null): void {
    const g = this.require(id);
    if (status === "active") {
      if (g.tokenBudget !== null && g.tokensUsed >= g.tokenBudget) throw Error("目标预算已耗尽，不能恢复");
      if (!["paused", "blocked", "usageLimited"].includes(g.status)) throw Error("只能恢复已暂停或阻塞的目标");
    }
    if (status === "blocked" && !reason?.trim()) throw Error("阻塞时必须说明原因");
    g.status = status; g.reason = reason; g.updatedAt = this.now();
  }
  account(id: string, tokens: number, ms: number): void {
    const g = this.state.goal;
    if (!g || g.id !== id || g.status !== "active") return;
    g.tokensUsed = Math.min(Number.MAX_SAFE_INTEGER, g.tokensUsed + Math.max(0, Math.floor(tokens)));
    g.activeMs = Math.min(Number.MAX_SAFE_INTEGER, g.activeMs + Math.max(0, Math.floor(ms)));
    g.updatedAt = this.now();
    if (g.tokenBudget !== null && g.tokensUsed >= g.tokenBudget) {
      g.status = "budgetLimited"; g.reason = "目标 token 预算已耗尽";
    }
  }
  complete(id: string): Receipt {
    if (!this.state.goal && this.state.receipt?.id === id) return clone(this.state.receipt);
    const g = this.require(id);
    if (g.continuous) throw Error("持续目标不能因单轮完成而结束；继续下一轮具体工作。只有用户能通过 /goal pause 或确认 /goal clear 停止该目标。");
    if (g.status !== "active" && g.status !== "budgetLimited") throw Error("请先通过 /goal resume 恢复目标，再确认完成");
    const receipt: Receipt = { id, status: "complete", tokensUsed: g.tokensUsed, activeMs: g.activeMs, completedAt: this.now() };
    // User customization: retain only an objective-free completion receipt.
    this.state = { version: 1, goal: null, receipt };
    return clone(receipt);
  }
  budgetNotified(id: string): void { this.require(id).budgetNoticeSent = true; }
  private require(id: string): Goal {
    const g = this.state.goal;
    if (!g || g.id !== id) throw Error("目标已变更或已清理；请重新读取 get_goal");
    return g;
  }
}
