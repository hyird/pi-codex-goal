# Codex CLI goal 运行逻辑参考

唯一的 goal 参考仓库：[openai/codex](https://github.com/openai/codex)。

固定检查版本：`b741e480e203f037ca726bc2a76d99a8e8668e66`（本次检查时 GitHub main 的 tree SHA）。本插件是独立 TypeScript 实现，并非其他 Pi goal 插件的 fork；没有复制 Codex 的 Rust 源文件或提示模板。

## 来源及实现对应

| Codex 路径（以上固定版本） | 参考行为 | Pi 实现 |
|---|---|---|
| `codex-rs/ext/goal/src/runtime.rs` / `continue_if_idle` | 读取持久状态；只允许 active；原子检查目标与空闲状态；拒绝排队/过期执行 | `GoalStore` 同步 mutation、goal ID 运行绑定、`kick` 与 `agent_before_settle` |
| `runtime.rs` / `apply_external_goal_set` | 状态变更后恢复 accounting，空闲时启动，不将状态变更伪装成用户提问 | `/goal` 状态变更与隐藏 control |
| `runtime.rs` / `stop_active_goal_for_turn` | 完成宿主重试后的终止错误阻塞目标；额度错误单独标记 usageLimited | `agent_before_settle` 的 error outcome 分支 |
| `codex-rs/ext/goal/src/extension.rs` | thread idle 驱动续跑；turn start/stop/abort 驱动 accounting；错误不立即续跑 | Pi 生命周期适配，没有后台续跑/恢复 timer |
| `codex-rs/ext/goal/src/steering.rs` | 使用内部模型上下文片段，来源 goal，不是普通用户提交 | Pi `custom_message`, `display: false`；从不调用 `sendUserMessage` |
| `codex-rs/ext/goal/src/accounting.rs` | 三次自动空输出、三次执行失败后 blocked；基于 goal ID 精确归属 | emptyRuns / failureRuns、run ID guard、WeakSet response 去重 |
| `accounting.rs` / `goal_token_delta_for_usage` | 新处理输入（扣除 cached read）+ output；reasoning 不重复计算；归集子执行用量 | Pi `input + cacheWrite + output`，只计 top-level 工具的聚合 usage |
| `codex-rs/ext/goal/src/tool.rs` | get / create / update 工具；未完成目标不可自动创建覆盖；完成前计费；终态停止 | 三个同名工具、终态完成记录、明确替换参数 |
| `codex-rs/tui/src/app/thread_goal_actions.rs` | 重新载入时暂停目标需用户确认恢复 | 重载保留目标并暂停，显式 `/goal resume` |

## 按用户需求与宿主条件做的差异

1. **目标正文只放插件状态**：Codex 的 continuation 模板包含 objective。本插件不在 continuation 里放正文，改为模型读取 `get_goal`。
2. **完成后清理当前目标**：Codex 保留 complete goal。本插件删除当前 objective，只保留不含正文的 completion receipt，用于重复 complete 的幂等性。
3. **Pi custom 状态代替 Codex SQLite**：跟随当前会话分支恢复，不混用所有分支。旧日志不作破坏性重写；压缩不删除插件状态。
4. **Pi 最终可操作边界**：`agent_end` 之后宿主仍可能重试。使用 Pi 1.0 的 `agent_before_settle` 等价适配 Codex 最终 thread-idle admission；不在 notification-only `agent_settled` 启动模型。
5. **用户取消会暂停**；暂停不取消已在运行的工具。重开 active 保存状态时变 paused，避免未经许可恢复自主执行。
6. 显式替换和交互确认 clear 是用户控制的例外，不由模型自行放弃目标。

## 验证边界

- 原生 Pi 1.0 SDK 测试：读取、创建、完成、自动续跑、暂停、取消、阻塞恢复、配额恢复、预算、一致计费、并发替换、真实用户 follow-up 优先、三次空输出/执行错误、宿主 retry、重载。
- 真实 Bun Pi CLI / PTY：regular + fullscreen 模式的 ↑ 与重新打开会话；无网络、无真实模型调用。
- 不声称证明模型必然遵守每个验收条件；与 Codex 一样，完成工具要求模型以实际证据自查。
- 不声称对旧插件的状态或已污染的输入历史自动迁移/擦除。
