# Codex CLI goal 运行逻辑参考

唯一的 goal 参考仓库：[openai/codex](https://github.com/openai/codex)。

本次固定检查提交：[28a264fbc766a59f2b550b8318f88e4a4b8dffe1](https://github.com/openai/codex/commit/28a264fbc766a59f2b550b8318f88e4a4b8dffe1)。通过官方 GitHub API 取得 main 的 commit SHA，再从该提交读取原始源码，不以搜索摘要或无版本的本地缓存代替源码证据。初始参考 tree SHA 为 `b741e480e203f037ca726bc2a76d99a8e8668e66`。

本插件是独立 TypeScript 实现，并非其他 Pi goal 插件的 fork；没有复制 Codex 的 Rust 源文件或整份提示模板。

## 来源及实现对应

| Codex 路径（以上固定版本） | 参考行为 | Pi 实现 |
|---|---|---|
| `codex-rs/ext/goal/src/runtime.rs` / `continue_if_idle` | 读取持久状态；只允许 active；原子检查目标与空闲状态；拒绝排队/过期执行 | `GoalStore` 同步 mutation、goal ID 运行绑定、`kick` 与 `agent_before_settle` |
| `runtime.rs` / `apply_external_goal_set` | 状态变更后恢复 accounting，空闲时启动，不将状态变更伪装成用户提问 | `/goal` 状态变更与隐藏 control；仅为 Pi 适配，并非完全相同的无消息调度语义 |
| `runtime.rs` / `stop_active_goal_for_turn` | 完成宿主重试后的终止错误阻塞目标；额度错误单独标记 usageLimited | `agent_before_settle` 的 error outcome 分支 |
| `codex-rs/ext/goal/src/extension.rs` | thread idle 驱动续跑；turn start/stop/abort 驱动 accounting；错误不立即续跑 | Pi 生命周期适配，没有后台续跑/恢复 timer |
| `codex-rs/ext/goal/src/steering.rs` | 使用内部模型上下文片段，来源 goal，不是普通用户提交 | Pi `custom_message`, `display: false`；从不调用 `sendUserMessage`，但 Pi 转给模型时仍使用 user role，区别见下文 |
| `codex-rs/ext/goal/templates/goals/continuation.md` | 跨轮保持完整目标；不以阶段成果缩小成功条件；逐项用当前权威证据审计完成 | 共用 `COMPLETION_GUIDANCE`，同时覆盖 continuation、工具提示指南和完成工具说明 |
| `codex-rs/ext/goal/src/accounting.rs` | 三次自动空输出、三次执行失败后 blocked；基于 goal ID 精确归属 | emptyRuns / failureRuns、run ID guard、WeakSet response 去重 |
| `accounting.rs` / `goal_token_delta_for_usage` | 新处理输入（扣除 cached read）+ output；reasoning 不重复计算；归集子执行用量 | Pi `input + cacheWrite + output`，只计 top-level 工具的聚合 usage |
| `codex-rs/ext/goal/src/tool.rs` | get / create / update 工具；未完成目标不可自动创建覆盖；完成前计费；终态停止 | 三个同名工具、终态完成记录、明确替换参数 |
| `codex-rs/tui/src/app/thread_goal_actions.rs` | 重开会话时对已 paused / blocked / usageLimited 的目标提示恢复 | 重载额外将 active 目标暂停，显式 `/goal resume`；这是本插件的保守策略，不等同 Codex runtime 恢复 active 状态 |

## 本次源码核对的关键结论

- [continuation.md 第 9–12 行](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/ext/goal/templates/goals/continuation.md#L9-L12)：目标跨轮持续；结束当前轮不能缩小目标，也不能把成功重定义成已完成的较小任务。
- [continuation.md 第 34–46 行](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/ext/goal/templates/goals/continuation.md#L34-L46)：完成先视为未经证明，再从原目标和引用材料导出要求，对每项检查当前权威证据。测试通过不能替代与目标同范围的验证；缺失、间接或不确定证据意味着继续工作。
- [runtime.rs / continue_if_idle](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/ext/goal/src/runtime.rs#L425-L487)：续跑读取持久目标，只判断 active 和宿主空闲准入，不因一轮结束、存在阶段成果或测试通过自动 complete。
- [spec.rs / create_update_goal_tool](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/ext/goal/src/spec.rs#L60-L84) 与 [tool.rs / handle_update](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/ext/goal/src/tool.rs#L243-L311)：提示要求完整目标已实现且没有必需工作剩余，paused 必须由用户明确请求；执行器校验允许的状态并持久更新，不机械证明这些自然语言条件。
- [protocol.rs / ThreadGoal](https://github.com/openai/codex/blob/28a264fbc766a59f2b550b8318f88e4a4b8dffe1/codex-rs/protocol/src/protocol.rs#L4112-L4124)：原版没有 `continuous` 字段；上述创建工具定义也没有持续模式参数。模型应根据目标文本判断要求的最终状态，而不是关键词匹配。本插件的保守文本门控是用户要求下增加的保护，不冒充原版能力；提示也明确未标记为 continuous 不证明目标存在有限终点。

## 按用户需求与宿主条件做的差异

1. **目标正文只放插件状态**：Codex 的 continuation 模板包含 objective。本插件不在 continuation 里放正文，改为模型读取 `get_goal`。
2. **有限目标完成后清理**：Codex 保留 complete goal。本插件对有限目标删除当前 objective，只保留不含正文的 completion receipt，用于重复 complete 的幂等性。用户明确请求的持续目标不允许模型自动 complete，阶段交付不会清除目标。
3. **Pi custom 状态代替 Codex SQLite**：跟随当前会话分支恢复，不混用所有分支。旧日志不作破坏性重写；压缩不删除插件状态。
4. **Pi 最终可操作边界**：`agent_end` 之后宿主仍可能重试。使用 Pi 1.0 的 `agent_before_settle` 等价适配 Codex 最终 thread-idle admission；不在 notification-only `agent_settled` 启动模型。
5. **用户取消会暂停**；暂停不取消已在运行的工具。重开 active 保存状态时变 paused，避免未经许可恢复自主执行。
6. 显式替换和交互确认 clear 是用户控制的例外，不由模型自行放弃目标。
7. **消息适配不等同原生调度**：`display: false` 是 Pi 原生显示字段，不是不持久化、也不是不进入模型上下文。当前扩展 API 没有空闲时无消息启动能力；`continue: true` 也要求可运行上下文，assistant 结尾且无新输入时会被拒绝。在用户明确不允许修改 Pi 本体、接受隐藏消息回退后，保留 custom control，不假称零消息。
8. **尽力执行而非单项阻塞**：按用户要求，经验证不可能的单项要求可以说明并跳过；继续完成可行部分。模型必须显式声明 `all_work_blocked: true` 才能因必要依赖阻塞整个目标。真实宿主错误、用量限制、预算和无进展保护不受影响。可行性仍由模型基于证据判断，不声称布尔字段能证明所有工作确实不可执行。
9. **明确的自然语言恢复**：真实用户说“继续实现目标”时，在自己的输入轮恢复状态，不额外发送恢复消息。不是任意普通输入自动恢复，也不允许扩展控制消息代替用户许可。
10. **界面静默**：仅使用 Pi 原生 `renderShell: "self"` 与零行调用/结果渲染器隐藏三个 goal 工具；没有修改 Pi 本体，不影响工具执行、结果的模型上下文或其他工作工具。Goal 排在底部状态行最左侧，显示主题状态色、紧凑 token 用量 / 预算及累计工作时间。运行时每秒刷新显示，不为时钟刷新追加状态条目；底层计费值不变。
11. **mandatory getter 的空转保护**：Codex 的 `record_tool_outcome` 将工具结果算作 activity。本插件的 continuation 每轮要求读取状态，且管理工具对终端静默，因此从 0.2.1 起不把直接调用三个 goal 管理工具当成实质进展；连续三轮只有管理调用、没有非空任务文本或其他工作工具时仍可触发无输出保护。普通工具及非空文本仍重置计数，不判定其内容必然推进了目标，也不尝试证明任意嵌套工具脚本的语义进展。停止时通知一次简短原因并保留目标。这是针对 Pi 适配层的差异，不声称逐字复制 Codex 的 activity 规则。
12. **用户要求的持续工作**：按用户要求增加持久 `continuous` 标志。目标正文的明确持续措辞经一个权威状态入口判断，不新增命令或工具参数；旧快照缺少标志时补全。`GoalStore.complete` 拒绝已识别的持续目标，不只依靠提示约束；模型暂停入口要求当前真实用户的明确请求，绑定同一 goal ID 且不可由扩展输入授权。自然语言完成条件仍按原目标和完整审计判断，不以这个保守标志代替语义理解。有限任务不因此变成无穷执行。取消、预算、宿主错误与无进展保护仍保留。这是定制差异，不声称 Codex 的原始实现提供相同分类机制。

## 验证边界

- 原生 Pi 1.0 SDK 测试：读取、创建、完成、自动续跑、暂停、取消、阻塞恢复、配额恢复、预算、一致计费、并发替换、真实用户 follow-up 优先、三次空输出/执行错误、宿主 retry、重载。
- 真实 Bun Pi CLI / PTY：regular + fullscreen 模式的 ↑ 与重新打开会话；无网络、无真实模型调用。
- 不声称证明模型必然遵守每个验收条件；与 Codex 一样，完成工具要求模型以实际证据自查。
- 不声称对旧插件的状态或已污染的输入历史自动迁移/擦除。
