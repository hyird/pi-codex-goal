# pi-codex-goal（独立实现）

从零实现的 Pi 1.0 goal 扩展。唯一的 goal 行为参考是 OpenAI Codex CLI；没有引用其他 Pi goal 插件的代码。参考版本、运行逻辑映射及差异见 [docs/codex-reference.md](docs/codex-reference.md)。

## 核心约定

- `/goal <目标>` 将正文保存在 Pi 的 **custom 插件状态条目**中，不作为用户消息送入对话。
- 模型使用 `get_goal` 读取目标。目标工具的结果仍然是正常的模型上下文；不声称模型完全不接收目标文本。
- 命令启动、命令恢复与自动续跑使用 Pi 原生的 `display: false` custom 控制消息，不含目标正文。**不调用 `sendUserMessage`，不操作编辑器历史**。这只隐藏终端显示，消息仍持久化并进入模型上下文；不是 Codex 的原生无消息调度。当前 Pi 无法在普通扩展中保证无输入唤醒，因此保留此适配，不修改 Pi 本体。
- 按 ↑ 不会出现插件生成的长提示；你自己输入的 `/goal ...` 或 `/goal resume` 仍属于你自己的输入历史。
- 未完成目标在暂停、阻塞、用量限制、预算停止、关机、重载和压缩后保留。重载后不会擅自开工，使用 `/goal resume`，或明确输入“继续实现目标”。
- 尽力完成可行部分：单项要求经验证无法实现时，说明原因并跳过，继续其余工作，不因此阻塞整个目标。尚未验证或仅有困难，不算无法实现。
- 页脚 token 自动使用 **K / M / B / T**，最多一位小数，例如 `664.8K tokens`。状态和模型工具结果仍保留精确整数。
- `get_goal` / `create_goal` / `update_goal` 在 Pi 终端里隐藏调用及结果行（包括展开状态）；只保留页脚与实际进展、最终答复。其他工作工具不隐藏。此渲染不删除会话条目；RPC/第三方界面若不使用 Pi TUI 渲染器，仍可能自行显示工具记录。
- 完成后 `goal: null`，保留不含目标正文的完成记录（ID、token、时间），取消自动续跑。用户也可以通过明确确认的 clear / replacement 提前移除目标。
- **清理是当前插件状态的逻辑清理，不是安全擦除**。Pi 是追加式会话日志，旧快照和已出现的工具结果不会被物理改写。

## 命令

```text
/goal 实现功能，并验证所有验收条件
/goal
/goal status
/goal pause
/goal resume
/goal clear
```

`pause` 停止自动续跑，不强行中断已在执行的工具。Esc/宿主取消会暂停目标。`resume` 只接受 paused / blocked / usageLimited，不突破已耗尽的 token 预算。替换或提前 clear 未完成目标要求交互确认。

也可以在真实用户输入中明确说“继续目标”“继续实现目标”“恢复当前目标”或 `resume goal`。该输入自身唤醒模型并恢复目标，不再额外生成恢复消息。普通聊天、否定/引用/提问以及扩展生成的输入不会自动恢复；不会突破预算。

## 模型工具

- `get_goal()`：当前目标及完成记录。
- `create_goal({ objective, token_budget?, replace_existing? })`：只应在用户明确要求时创建；未完成目标的替换需用户明确授权。
- `update_goal({ status: "complete" | "blocked" | "paused", reason?, all_work_blocked? })`：完成需要验证所有可行要求，并向用户说明经验证无法实现而跳过的项目；`blocked` 必须给出必要依赖阻止全部剩余可行工作的具体原因，并显式设置 `all_work_blocked: true`，否则拒绝状态更新，目标保持原状；暂停仅应遵照用户明确要求。

运行中把整个工具跟进链绑定到同一 goal ID，防止旧响应完成或计费到并发替换的新目标。宿主先完成重试、压缩和排队的真实输入，插件只在最终可操作的 idle 边界自动续跑。最终错误停止为 blocked 或 usageLimited，不自建后台重试定时器。

## 本地开发与验证

```sh
rtk bun install --ignore-scripts
rtk bun run check
rtk python3 test/ui-smoke.py
```

全部离线使用模拟 provider，不调用付费模型。SDK 测试对接真实 Pi 1.0；终端测试使用真实 Pi CLI + PTY，验证 regular / fullscreen 的管理工具隐藏、普通工作工具可见、↑ 历史及重新打开会话后的历史。终端测试需要 Linux/macOS、Python 3 和 PATH 中的 Pi CLI；也可通过 `PI_BINARY` 指定 Bun 版 Pi 启动器。

源码：`src/state.ts`（状态、预算、完成清理）、`src/index.ts`（Pi 工具、命令、生命周期适配）。

## 安装

要求 Pi 1.0 或更新版本。不要与其他注册 `/goal` 或同名 goal 工具的插件同时加载。

GitHub 安装：

```sh
pi install git:github.com/hyird/pi-codex-goal
```

或者把 `~/.pi/agent/settings.json` 中原来的 goal 包声明替换为：

```json
"git:github.com/hyird/pi-codex-goal"
```

然后重启 Pi 或 `/reload`。私有仓库需要 Git 已配置 GitHub 认证（例如已登录的 `gh` 配合 `gh auth setup-git`）；访问凭据不要写入插件设置。

更新远程插件：

```sh
pi update git:github.com/hyird/pi-codex-goal
```

本版本不迁移其他插件的目标。旧插件已经保存为用户消息的提示仍在旧会话历史中；若要立刻得到干净的 ↑ 历史，请开启新会话。
