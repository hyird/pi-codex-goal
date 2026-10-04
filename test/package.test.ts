import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

test("local package manifest discovers only the independent implementation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-goal-package-"));
  try {
    const path = resolve(import.meta.dir, "..");
    const settingsManager = SettingsManager.inMemory({ packages: [path] });
    const loader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, settingsManager,
      noContextFiles: true, noSkills: true, noPromptTemplates: true, noThemes: true });
    await loader.reload();
    const loaded = loader.getExtensions();
    expect(loaded.errors).toEqual([]);
    expect(loaded.extensions.length).toBe(1);
    expect(loaded.extensions[0]!.commands.has("goal")).toBe(true);
    expect([...loaded.extensions[0]!.tools.keys()].sort()).toEqual(["create_goal", "get_goal", "update_goal"]);
  for (const { definition } of loaded.extensions[0]!.tools.values()) {
    expect(definition.renderShell).toBe("self");
    expect(typeof definition.renderCall).toBe("function");
    expect(typeof definition.renderResult).toBe("function");
  }
    expect(loaded.extensions[0]!.handlers.has("agent_before_settle")).toBe(true);
    expect(loaded.extensions[0]!.resolvedPath).toBe(join(path, "src/index.ts"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
