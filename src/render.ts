import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const emptyComponent = () => ({ render: (_width: number): string[] => [], invalidate() {} });

/** Hide bookkeeping rows in Pi's TUI, without disabling tools or their model results. */
export const quietGoalRenderers = {
  renderShell: "self",
  renderCall: emptyComponent,
  renderResult: emptyComponent,
} satisfies Pick<ToolDefinition, "renderShell" | "renderCall" | "renderResult">;
