# 验证记录

## 直接核对 Codex CLI 源码并补齐完整目标审计（2026-10-06）

通过官方 GitHub API 固定 commit `28a264fbc766a59f2b550b8318f88e4a4b8dffe1`，从同一提交读取 goal 的 runtime、extension、accounting、steering、spec、tool 和提示模板，以及协议目标类型与 TUI 恢复入口。源码路径、固定链接和定制差异见 [codex-reference.md](codex-reference.md)。

Codex 原版没有 `continuous` 参数、字段或关键词分类器。它的续跑由持久 active 状态和 idle admission 驱动；提示要求跨轮保持完整目标，完成前逐项核对当前权威证据。状态工具不机械证明自然语言目标已实现。本插件保留用户要求的保守状态门控，同时补齐以下提示规则：

- 不以单轮成果、当前已有实现或易通过测试的子集重定义成功。
- 从原目标和引用材料导出要求，检查每项的权威证据，验证范围与要求范围一致；部分测试通过不能证明整体完成。
- 缺失、不确定或间接证据意味着继续工作。有限目标仍按用户允许的尽力执行合同说明经验证不可能的跳过项；持续目标仍继续具体工作周期。
- 是否存在有限终点仍按原目标理解；未被保守分类器标记，不证明目标有限。

上述规则共用一份 `COMPLETION_GUIDANCE`，用于 continuation、getter 的提示指南和更新工具说明。新增两项控制消息回归在修改前均失败，修改后通过；真实 SDK 同时检查控制消息及已注册工具说明/指南，目标正文仍不复制到隐藏控制消息。

- `PI_OFFLINE=1 bun run check`：TypeScript 通过，**129 个测试、0 失败**（本地 Pi 1.0.0 SDK）。
- 已同步的安装源码和测试复制到隔离目录，使用全局 Pi **1.0.3** 依赖执行 `PI_OFFLINE=1 bun test`：**129 个测试、0 失败**。临时目录已清理，没有改动安装目录的依赖。仍为离线模拟 provider，不调用真实模型或付费服务，不证明任意模型必然遵守完成审计。
- 两个工作树的 `git diff --check` 通过；部署前确认安装工作树干净且 HEAD 一致，通过精确补丁同步，不覆盖额外用户改动。
- 日志：`/tmp/pi-goal-codex-audit-regression.log`、`/tmp/pi-goal-codex-audit-check.log`、`/tmp/pi-goal-codex-audit-host-check.log`。

验证完成时，实现已本地同步到 `/home/cloudcli/.pi/agent/git/github.com/hyird/pi-codex-goal`，当时尚未提交或推送。用户随后明确要求提交并推送；远程版本以包含本记录的实现提交为准。当前会话未强制重载，需用户 `/reload` 或重启，再 `/goal resume` 或明确说“继续实现目标”。没有修改 OMP、Pi 本体、认证、依赖，也没有手动改写活跃会话日志。

## 持续目标不因阶段完成结束（2026-10-06）

用户的“不断打磨ruvia-http 优化性能 修复bug”被单轮收尾误作整体完成。源码根因是 continuation / 工具提示一概要求开放式优化收尾，状态完成入口又没有持续语义门控。未修改 OMP；修复在 Goal 插件内完成。

- **没有新增命令或工具参数**：持续/有限语义根据目标正文的明确措辞判断，内部保存 `continuous` 标志；旧快照缺少标志时按同一规则补全，不改变 ID 和既有计费。
- 持续目标的 `complete` 在权威状态层被拒绝，不生成 receipt 或清除正文；单轮回复结束后仍能进入下一轮具体工作。
- 持续目标的模型 `paused` 请求还需当前真实用户明确授权。真人 interactive / RPC 请求有效；扩展输入、单轮完成不授予暂停权限。直接 `/goal pause`、取消与既有预算/错误/无进展保护保留。
- 有限目标仍正常完成与清理。带明确有限终点的持续措辞，以及对“不断触发”缺陷的描述，不误判成无终点执行。自然语言规则保守，不声称理解全部任意表述。

先增加状态层和真实 SDK 回归：旧实现 2 项均失败，直接完成持续目标不抛错，SDK 在 3 个请求后结束而不执行下一轮。修复后验证完成/暂停误请求被拒绝、后续真实工作执行、用户暂停/clear、预算保留正文、旧状态归一化以及所有既有有限目标流程。

- `bun run check`：TypeScript 通过，**127 个测试、0 失败**（依赖中的 Pi 1.0.0 SDK）。
- 同一套源码和测试临时复制到隔离目录，以全局依赖运行 `PI_OFFLINE=1 bun test`：**127 个测试、0 失败**（实际宿主 Pi 1.0.3，Bun 1.4.2）。provider 为离线模拟，不调用真实模型或付费服务；临时目录已清理。
- `git diff --check` 通过。
- 此次没有修改渲染器，不重复运行 Python PTY 测试；原生工具隐藏与页脚相关 Bun 测试仍全部通过。不能据此宣称任意模型总会选择有实质收益的下一项工作。

代码同步到当前 GitHub 包安装目录；当前已运行的会话仍持有旧扩展实例，需要 `/reload` 或重启后生效。重载会按既有安全合同保留并暂停目标，再 `/goal resume` 或明确说“继续实现目标”，不必重新创建目标。此次没有改写活跃会话日志，没有强制重载 Pi，没有修改认证、包依赖或 OMP。

## 0.2.1：仅管理调用不再掩盖无输出空转

限定检查发现可复现的 Pi 适配问题：连续三轮仅 `get_goal` 与空回复，旧版继续发出第七个 provider 请求，由测试 provider 的安全兜底错误终止，而不是命中三轮无输出保护。

修复后，同一回归测试在六个请求后停止并保留目标，只通知一次原因；计费仍为精确的 66 tokens。另验证实际工作工具、非空任务回复不被误停，正常工作重置之前的无输出计数。没有把某项功能无法实现当作整目标阻塞理由。

`rtk bun run check`：TypeScript 通过，**79 个测试、0 失败**。`rtk python3 test/ui-smoke.py`：regular / fullscreen 以及会话重开均通过；管理工具仍隐藏，普通工作仍可见，插件生成 user message 为 0。

本次终端证据：regular `/tmp/pi-goal-tui-z2i5gk8x`，fullscreen `/tmp/pi-goal-tui-ph0tw9jy`。真实全局 Pi 1.0.2 SDK 的补充回归也通过：仅管理调用在六个请求后停止，非空任务回复在八个请求后完成、不误停；脚本为 `/tmp/verify-pi-goal-empty-guard.ts`。没有修改 Pi 本体，继续仅使用 Codex 原始文件作为 goal 参考。

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

这些测试验证插件协议与显示行为，不证明模型每次都能正确判断可行性；布尔声明不代替真实证据。

实现提交 `93b4348c07f35d4a8edea3291276fd1f883d571f` 已推送到公有 GitHub 仓库。该提交的 GitHub Actions 已通过：<https://github.com/hyird/pi-codex-goal/actions/runs/37173252749>。

在线执行 `pi update git:github.com/hyird/pi-codex-goal`，确认安装 clone 与实现提交一致。真实全局配置 `DefaultResourceLoader.reload()`：errors 为 `[]`，唯一 `/goal` 来源仍为 GitHub clone；三个管理工具均注册原生静默渲染器，已安装的 K/M/B/T 格式化、明确恢复识别和阻塞门控均验证通过。验证脚本为 `/tmp/verify-pi-codex-goal-0.2.ts`。

当前运行会话仍需用户 `/reload` 或重启才加载新代码；之后明确说“继续实现目标”即可恢复已保留的目标。没有为了恢复旧状态而替换目标、改写历史，或向当前会话伪造用户输入。

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
