import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTokenCount } from "./format.ts";
import type { State, Status } from "./state.ts";

// Pi's native footer and OMP both sort extension statuses by key.
export const GOAL_STATUS_KEY = "0:pi-codex-goal";
type Theme = Pick<ExtensionContext["ui"]["theme"], "fg">;
const statuses: Record<Status, { label: string; color: Parameters<Theme["fg"]>[0] }> = {
  active: { label: "Active", color: "accent" },
  paused: { label: "Paused", color: "dim" },
  blocked: { label: "Blocked", color: "warning" },
  usageLimited: { label: "Usage limit", color: "warning" },
  budgetLimited: { label: "Budget reached", color: "warning" },
};

export function formatDuration(ms: number): string {
  const seconds = Math.floor(Number.isFinite(ms) ? Math.max(0, ms) / 1000 : 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = `${seconds % 60}`.padStart(2, "0");
  return hours ? `${hours}h ${`${minutes}`.padStart(2, "0")}m ${rest}s`
    : minutes ? `${minutes}m ${rest}s` : `${seconds}s`;
}

/** Rendering only: the live clock never changes persisted accounting. */
export function formatGoalStatus({ goal, receipt }: State, theme: Theme | undefined, liveMs = 0): string | undefined {
  if (!goal && !receipt) return;
  const record = goal ?? receipt!;
  const label = goal ? statuses[goal.status] : { label: "Complete", color: "success" as const };
  const usage = goal?.tokenBudget !== null && goal?.tokenBudget !== undefined
    ? `${formatTokenCount(record.tokensUsed)} / ${formatTokenCount(goal.tokenBudget)} tokens`
    : `${formatTokenCount(record.tokensUsed)} tokens`;
  const elapsed = record.activeMs + (goal?.status === "active" && Number.isFinite(liveMs) ? Math.max(0, liveMs) : 0);
  const fg: Theme["fg"] = (color, text) => theme ? theme.fg(color, text) : text;
  return [fg(label.color, `Goal ${goal ? "●" : "✓"} ${label.label}`),
    fg("muted", usage), fg("dim", formatDuration(elapsed))].join(" · ");
}
