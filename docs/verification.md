# 验证记录

## 0.2.0：紧凑用量、尽力执行、静默管理工具

本地 SDK 依赖为 Pi 1.0.0；真实终端宿主为 Pi 1.0.2；运行与依赖管理为 Bun 1.4.2。没有修改 Pi 本体，也没有调用真实模型或付费服务。

- `rtk bun install --frozen-lockfile --ignore-scripts`：通过，锁文件无需变化。
- `rtk bun run check`：TypeScript 通过，**75 个测试、0 失败**。
- K/M/B/T、最大安全整数、边界舍入（999950 → 1M）通过；真实 SDK 验证页脚 `664.8K`，状态与模型工具结果仍是精确整数。
- 缺少 `all_work_blocked: true` 的阻塞请求被拒绝，可行工作继续并完成；声明全部被必要依赖阻止的阻塞仍保留。
- 明确的真人输入恢复 blocked / paused / usageLimited，兼容 interactive / RPC；不新增恢复控制消息，扩展生成输入不授予恢复许可，不绕过预算。
- 三个 goal 工具在原生工具组件的 pending / 执行 / partial / error / expanded 阶段均为零行渲染；已注册工具仍可调用。
- regular / fullscreen 真实 CLI/PTY 均通过：管理工具调用和结果不显示，普通工作探针可见；重新打开会话也通过，↑ 历史无插件生成消息。

终端证据目录：regular `/tmp/pi-goal-tui-604nzv97`，fullscreen `/tmp/pi-goal-tui-shxxjt09`。包含 `audit.jsonl`、真实 session JSONL、`terminal-live.log`、重新打开后的 `terminal.log`。

这些测试验证插件协议与显示行为，不证明模型每次都能正确判断可行性；布尔声明不代替真实证据。远程发布与安装验证会在完成后补记。

## 初始 0.1.0：类型与行为

初始宿主为 Pi 1.0.0；以下记录保留为初始发布证据。



`rtk bun run check`：TypeScript 检查通过，26 个测试通过，0 失败。

覆盖：插件包发现、状态校验/恢复、目标完成清理、阻塞/暂停/配额恢复、用户取消、预算停止和一次收尾、Codex token 口径、空输出/执行失败阈值、并发替换归属、宿主 retry、排队真实输入优先、插件工具不可用时停止、compaction 后的插件状态恢复。

## 初始 0.1.0：真实终端 ↑ 输入历史

`rtk python3 test/ui-smoke.py`：两种模式均通过。

- regular：`/tmp/pi-goal-tui-u7u2bd10`
- fullscreen：`/tmp/pi-goal-tui-1bw1__zr`

各目录包含 audit.jsonl、真实 session JSONL 和 terminal.log。模拟 provider 完整执行 get → blocked → resume → get → complete。

现场连续按 ↑ 的结果：

1. `/goal resume`（手动输入）
2. `/goal TUI_OBJECTIVE_ONLY_IN_STATE`（手动输入）
3. `HUMAN_ONLY_MESSAGE`（手动输入）

重新打开保存会话后的 ↑：`HUMAN_ONLY_MESSAGE`。插件生成的 user message 数量为 0；内部 control 条目为 2，均 `display: false`、不含目标正文。最新插件状态 `goal: null`，receipt.status 为 complete。

## 初始 0.1.0：安装来源与实际配置加载

初次本地验证时，原 `npm:pi-codex-goal` 替换为本地目录；该阶段备份为 `/home/cloudcli/.pi/agent/backups/settings.before-local-codex-goal.json`。

随后创建并推送公有仓库：<https://github.com/hyird/pi-codex-goal>，默认分支 `main`。当前 `/home/cloudcli/.pi/agent/settings.json` 的 goal 来源已改为 `git:github.com/hyird/pi-codex-goal`，不再指向本地工作目录。

来源切换备份：`/home/cloudcli/.pi/agent/backups/settings.before-github-codex-goal.json`。使用 Bun 1.4.2 完成 Pi 的 Git 包安装。

使用真实全局 agentDir 和全部已配置扩展进行 `DefaultResourceLoader.reload()`：

- errors：`[]`
- 唯一 `/goal` 来源：`/home/cloudcli/.pi/agent/git/github.com/hyird/pi-codex-goal/src/index.ts`
- 注册工具：get_goal / create_goal / update_goal

GitHub Actions 首次运行已通过：<https://github.com/hyird/pi-codex-goal/actions/runs/37170654665>。覆盖冻结锁文件安装、TypeScript、26 个离线测试，以及 regular / fullscreen 的真实终端历史测试。

配置在重启或 `/reload` 后生效；没有向当前正在运行的旧扩展强制注入重载。没有修改 Pi 本体、现有系统 Node 或认证配置。

## 仍需理解的边界

- 上述 provider 是离线模拟，不是对任意模型推理可靠性的保证。
- 完成清理针对当前状态，不物理擦除历史会话快照。
- 旧插件状态和旧用户消息不会迁移/删除；使用新会话获得立即干净的 ↑ 历史。
