# 本次验证记录

宿主：本机 `@earendil-works/pi-coding-agent@1.0.0`；运行与依赖管理：Bun 1.4.2。没有调用真实模型或付费服务。

## 类型与行为

`rtk bun run check`：TypeScript 检查通过，26 个测试通过，0 失败。

覆盖：插件包发现、状态校验/恢复、目标完成清理、阻塞/暂停/配额恢复、用户取消、预算停止和一次收尾、Codex token 口径、空输出/执行失败阈值、并发替换归属、宿主 retry、排队真实输入优先、插件工具不可用时停止、compaction 后的插件状态恢复。

## 真实终端 ↑ 输入历史

`rtk python3 test/ui-smoke.py`：两种模式均通过。

- regular：`/tmp/pi-goal-tui-u7u2bd10`
- fullscreen：`/tmp/pi-goal-tui-1bw1__zr`

各目录包含 audit.jsonl、真实 session JSONL 和 terminal.log。模拟 provider 完整执行 get → blocked → resume → get → complete。

现场连续按 ↑ 的结果：

1. `/goal resume`（手动输入）
2. `/goal TUI_OBJECTIVE_ONLY_IN_STATE`（手动输入）
3. `HUMAN_ONLY_MESSAGE`（手动输入）

重新打开保存会话后的 ↑：`HUMAN_ONLY_MESSAGE`。插件生成的 user message 数量为 0；内部 control 条目为 2，均 `display: false`、不含目标正文。最新插件状态 `goal: null`，receipt.status 为 complete。

## 安装来源与实际配置加载

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
