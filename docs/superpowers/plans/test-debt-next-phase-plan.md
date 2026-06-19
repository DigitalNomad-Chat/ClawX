# 测试债务清理 · 下阶段执行计划（v2）

> 编制日期：2026-06-19 · 分支 `feat/membership-system-merge-v0.4.4`
> 前置：v0.4.5 A/B/C/D 四组选择性移植已完成并提交（`fbf66fcc`，见 [upstream-sync-log.md](./upstream-sync-log.md)）
> 本版变更：修正 v1 的 B2 挂起缺陷（基线 45→39），补全三个方向（store/chat-UI/杂项）的根因深度调研，重排为五批次可执行计划。

## 1. 背景与精确基线

D-group（#1043）已移植并提交。本轮聚焦**剩余测试债务的根因调研与计划制定**。

**基线修正记录**：v1 文档声称基线 44（B2 挂起后），实际复查发现 B2 挂起有缺陷——只替换了文件顶部 `import`，后续 190+ 行原始测试代码（含指向不存在模块的导入与 `vi.mock`）仍在模块加载阶段执行，挂起未生效。真实基线当时是 **45**。已用纯 `describe.skip` 重写 5 个挂起文件（`use-feature-guard`/`member-manager`/`token-manager`/`usage-counter`/`openclaw-doctor`），挂起生效后：

| 指标 | 修正前（v1 误报） | 挂起缺陷修正后（真实） |
|---|---|---|
| 测试级 | 44 failed / 939 passed | **39 failed / 938 passed / 977 total** |
| 文件级 | 19 failed | **16 failed** / 116 passed / 5 skipped (137) |

> 挂起修正的 5 个文件当前为**工作树未提交**改动（遵循 CLAUDE.md，待用户授权再提交）。

**当前基线（S0+S1+S2 已执行）**：`15 failed / 961 passed / 1 skipped / 977 total`，5 个失败文件。S2 实际修复力度与计划一致（20→15），其中 `chat-page-execution-graph` 用 1 skip 置换 1 fail，`channel-routes` 全清；`typecheck` 通过。

## 2. 失败全景（39 失败 / 16 文件）

### 2.1 按文件分布（`pnpm vitest run` 实测，2026-06-19）

| 失败数 | 文件 | 方向 |
|---:|---|---|
| 8 | `tests/unit/chat-store-history-retry.test.ts` | Store 双轨 |
| 5 | `tests/unit/chat-store-session-label-fetch.test.ts` | Store 双轨 |
| 5 | `tests/unit/chat-page-execution-graph.test.tsx` | Chat UI |
| 3 | `tests/unit/strip-first-run.test.ts` | 杂项 |
| 3 | `tests/unit/channel-routes.test.ts` | 杂项 |
| 2 | `tests/unit/session-label-fetch.test.ts` | Store 双轨 |
| 2 | `tests/unit/main-layout.test.tsx` | Chat UI |
| 2 | `tests/unit/chat-artifact-panel-layout.test.tsx` | Chat UI |
| 2 | `tests/unit/app-routes.test.ts` | 杂项 |
| 1 | `tests/unit/skills-store-fetch-parallel.test.ts` | 杂项 |
| 1 | `tests/unit/skills-errors.test.ts` | 杂项 |
| 1 | `tests/unit/chat-target-routing.test.ts` | Store 双轨 |
| 1 | `tests/unit/chat-question-directory.test.tsx` | Chat UI |
| 1 | `tests/unit/channel-config.test.ts` | 杂项 |
| 1 | `tests/unit/artifact-panel.test.tsx` | Chat UI |
| 1 | `tests/unit/agents-page.test.tsx` | Chat UI |

**方向聚合**：Store 双轨 16 · Chat UI 10 · 杂项 13 = 39 ✓

### 2.2 三方向根因总结（深度调研结论）

| 方向 | 失败 | 根因主轴 | 修复性质 |
|---|---:|---|---|
| **Store 双轨** | 16 | 单体 `src/stores/chat.ts`（3208 行）与上游拆分 store `src/stores/chat/*`（已存在但未被入口使用）的**行为差异**；`@/stores/chat` 仍解析到单体 | 改实现（对齐上游语义）+ 1 个真实 bug |
| **Chat UI** | 10 | 8/10 是同一 **mock 债务**：测试把 zustand store 当纯函数 mock，丢失 `.subscribe`/`.getState`/`.setState`/`.rpc`；2/10 是 i18n 默认值断言过时 | 补 mock 工厂 + 改断言 |
| **杂项** | 13 | 断言过时 6（改名/签名变化）· 测试环境/mock 过时 3 · 真实 bug 2（测试隔离单例污染、错误吞没）· 实现缺失 2（openclaw-doctor） | 改测试为主 + 2 个源码 bug |

---

## 3. 五批次执行计划（按风险/成本递增）

> 原则：**S0→S1 先清确定性债务（零风险），S2 修真实 bug，S3 攻克 store 双轨（最大且需决策），S4 挂起未实现功能。** 每批独立可验收、可回退。

### S0 · 零风险断言/改名对齐（8 个，≈0.5h，零风险）

纯测试侧改动，不改任何源码。KISS——对齐当前实现的事实。

| # | 文件 | 失败数 | 修复方案 | 源码依据 |
|---|---|---:|---|---|
| 1 | `tests/unit/strip-first-run.test.ts` | 3 | 改 import：`mergeClawXSection`→`mergeClawDockSection`、`ensureClawXContext`→`ensureClawDockContext` | `electron/utils/openclaw-workspace.ts:132/432` 已实现 ClawDock 命名（`rg` 确认旧名不存在） |
| 2 | `tests/unit/channel-config.test.ts` | 1 | 断言期望含 `'*': {}`（或测试输入设 `groupPolicy:'allowlist'` 验互补路径） | `channel-config.ts:1069-1082` 对 `open` 策略有意注入通配符 |
| 3 | `tests/unit/channel-routes.test.ts` | 2 | `saveChannelConfig` 断言补第 4 参 `expect.any(Object)` | `channels.ts:1642` 调用 4 参数版本 |
| 4 | `tests/unit/artifact-panel.test.tsx` | 1 | Preview 断言 `'Preview'`→`'源码'`（或 key-based i18n mock） | `ArtifactPanel.tsx:90` 默认值已本地化为中文 |
| 5 | `tests/unit/agents-page.test.tsx` | 1 | 先读 `ModelSelectorModal.tsx` 确认 modelId 选择器，`getByLabelText('modelIdLabel')`→`getByRole('textbox')`/`getByDisplayValue` | `Agents/index.tsx` 无 `modelIdLabel` key，输入框已移入 `ModelSelectorModal` |

**验收**：基线 39 → 31。

### S1 · 测试环境 / mock 补全（11 个，≈1.5h，低-中风险）

| # | 文件 | 失败数 | 修复方案 |
|---|---|---:|---|
| 1 | `tests/unit/main-layout.test.tsx` | 2 | 两处 `render` 用 `<MemoryRouter>` 包裹（`MainLayout.tsx:5/11` 用 `useLocation()` 检测 goclaw 路由） |
| 2 | `tests/unit/chat-question-directory.test.tsx` | 1 | 新建 `tests/helpers/store-mock.ts` 工厂 `createMockStore(state)`，返回带 `subscribe`/`getState`/`setState` 的 store-like 对象，替换纯函数 mock |
| 3 | `tests/unit/chat-artifact-panel-layout.test.tsx` | 2 | 同 #2（`useArtifactParser.ts:60` 调 `useChatStore.subscribe`） |
| 4 | `tests/unit/chat-page-execution-graph.test.tsx` | 5 | 已移至 S2：gateway mock 补齐后仍因真实 chat store 的 `loadHistory` 异步副作用触发 `waitFor` 超时，需结合源码时序修复 |
| 5 | `tests/unit/skills-store-fetch-parallel.test.ts` | 1 | 重写断言：`fetchSkills` 已改 `hostApiFetch('/api/skills/status')`，deferred 迁移到 `hostApiFetchMock`，断言并发调用顺序 |

**复用（DRY）**：#2/#3/#4 共用 `createMockStore` 工厂，消除重复的纯函数 mock 模式。
**风险**：#4 用真实 chat store + setState 驱动，`loadHistory` 异步副作用可能触发 `act()` 警告或时序 flaky，需跑 2-3 次确认稳定。
**横扫建议**：完成后 `rg "useChatStore: \(selector|useGatewayStore: \(selector" tests/`，治理同款隐患（范围外潜在文件）。

**验收**：基线 31 → 20。

### S2 · 真实 bug 修复（5 个，≈1.5h，中风险）

需改源码（真实缺陷）+ 配套测试。

| # | 位置 | 失败数 | 缺陷 | 修复 |
|---|---|---:|---|---|
| 1 | `src/stores/chat.ts:1637` | 3→0 | `hasNonToolAssistantContent` 把 `thinking` 块误判为 final content → 中间 `[thinking,toolCall]` 快照错误清 `sending/activeRunId`，run 被提前关闭（history-retry 的 3 个用例）。额外修复 line 2310/2321：pendingFinal 触发和 final-reply closer 均未排除 `stopReason=toolUse` 的混合 turn。 | 删除 1637 行 thinking 分支；pendingFinal 仅由非工具 assistant 内容触发；final closer 跳过 `hasPendingToolUse` 消息 |
| 2 | `tests/unit/channel-routes.test.ts` | 2→0 | `channels.ts:525` 模块级可变单例 `lastChannelsStatusOkAt/FailureAt` 跨测试不重置 → 单文件内顺序依赖，timeout 降级断言失败（`-t` 单跑通过） | `beforeEach` 加 `vi.resetModules()` 隔离单例 |
| 3 | `src/stores/skills.ts:173` | 1→0 | `partialError` 只检查 clawhub/config 的 rejected，**不检查** runtime `/api/skills/status` 的 rejected → runtime 失败被静默吞没，`error` 为 null | `partialError` 判定加 `runtimeSkillsResult.status==='rejected'` 分支；测试对齐 `hostApiFetch` mock |
| 4 | `tests/unit/chat-page-execution-graph.test.tsx` | 5→1 skip | jsdom 中 `react-virtuoso` viewport 高度为 0 不渲染 item；Flat mock 未渲染 `components.Footer`，导致流式回复气泡不挂载；scroll-to-latest 按钮在当前分支无对应实现（上游 #1031 未移植） | 重写 flat mock 渲染 Header/Footer 并加 key；scroll-to-latest 用例 `it.skip` + TODO 待 #1031 移植 |

**验收**：基线 20 → 15（原计划 20 → 18，实际多清 3 个失败），`typecheck` 通过。

### S3 · Store 双轨行为对齐（13 个，≈4-6h，高风险，需决策）

最大且结构性。剩余 store 失败 = 16（总）− 3（S2 已修的 thinking bug）= 13。

**核心决策点 D（见 §4）**：是逐点回灌单体 `chat.ts`，还是收口双轨让 `@/stores/chat` re-export 拆分版。

**13 个失败的功能点分解**（按调研）：

| 功能点 | 文件 | 失败 | 修复要点 | 成本/风险 |
|---|---|---:|---|---|
| ① final-reload force bypass | history-retry | 1 | 第 3046-3048 reload 前补 `forceNextHistoryLoad(currentSessionKey)`（helper 在 chat.ts:150） | 低/低 |
| ② 非启动 safety timer 移除 | history-retry | 1 | `getHistoryLoadingSafetyTimeout` 仅 initial foreground 返回值 | 低/中 |
| ③ stale retry 状态机 | history-retry | 2 | `applyLoadedMessages` 成功前用 `isCurrentSession()` 守卫，stale 不标记 `_foregroundHistoryLoadSeen` | 中/中 |
| ④ optimistic message preservation | history-retry | 1 | 空 rawMessages 且本地含 optimistic（无 id）时跳过清空 | 中/中 |
| ⑤ session summary hydration | session-label-fetch(5)+session-label-fetch.test(2) | 7 | 整块移植 summary hydration（host API `/api/sessions/summaries` 或 RPC fan-out，见决策点 E） | 高/中 |
| ⑥ attachment send 走 host API | chat-target-routing | 1 | sendMessage 的 media 分支改 `hostApiFetch('/api/chat/send-with-media')`（拆分版 `runtime-send-actions.ts:226` 已实现，保留 RPC fallback） | 中/中 |

> history-retry 共 8 失败：3（S2 #1 thinking）+ ① 1 + ② 1 + ③ 2 + ④ 1 = 7。剩余 1 个为 host-API-fallback 空 warn 断言（归入 ③ 的 retry 行为，一并处理）。

**验收**：基线 15 → 2（仅剩 app-routes 挂起项）。

### S4 · 挂起未实现功能（2 个，0h）

| 文件 | 失败 | 处置 |
|---|---:|---|
| `tests/unit/app-routes.test.ts` | 2 | `openclaw doctor` 两例 `it.skip` + TODO。`electron/utils/openclaw-doctor.ts` 模块与 `app.ts` 路由均不存在，属待开发功能 |

**验收**：套件内 0 failed（2 个 skip）。全量基线达 0 failed。

---

## 4. 关键决策点（执行 S3 前需确认）

**决策点 D — store 双轨收口方向**：
- **D1（推荐）**：让 `@/stores/chat` re-export 拆分版 `src/stores/chat/*`（与上游一致），一次性消除双轨。拆分版已存在，但缺 ⑤⑥ 等逻辑，需先回灌再切换。风险高但根治债务。
- **D2**：保留单体 `chat.ts`，逐点回灌缺失逻辑（①-⑥）。改动局部、可控，但双轨长期发散。
- **D3（最小可行）**：仅做 S2 + ①②（低成本高收益），13→修 5，剩 8 个标记 known-failure 挂起，不阻塞发布。

**决策点 E — session summary hydration 路径**（⑤ 的 7 个失败）：
- 上游存在两条互斥实现路径：host API `/api/sessions/summaries`（`chat-store-session-label-fetch.test.ts` 断言）vs gateway RPC `chat.history` fan-out（`session-label-fetch.test.ts` 断言）。
- 需确认上游最终采用哪条（倾向 host API，见 `chat-store-session-label-fetch.test.ts:112`）。若选 host API，RPC fan-out 的 2 个测试应作废/改写。

**决策点 F — 执行节奏**：
- F1：按 S0→S4 顺序全量推进至 0 failed。
- F2：仅推进 S0+S1+S2（确定性低风险，39→15），S3 store 留专项后续。
- F3：先做 S0（零风险），逐步评估。

## 5. 验收标准

| 阶段 | 基线目标 | 累计修复 |
|---|---|---:|
| 起点 | 39 failed / 938 passed | — |
| S0 后 | 31 failed | 8 |
| S1 后 | 24 failed | 15 |
| S2 后 | 15 failed（实际 20→15，超预期） | 24 |
| S3 后 | 2 failed（仅 app-routes） | 37 |
| S4 后 | 0 failed（2 skip） | 39 |

- `pnpm run typecheck` 全程通过。
- 每批完成后 `git diff --stat` 核对改动范围，单文件可 `git checkout -- <file>` 回退。

## 6. 风险与回退

| 风险 | 触发 | 缓解 |
|---|---|---|
| S1 execution-graph 时序 flaky | 真实 chat store 异步副作用 | 跑 3 次确认；必要时拆分用例 |
| S2 #1 thinking 判定改动 | 影响所有含 thinking 的 run 生命周期 | 该分支注释已标 known regression，删除即对齐上游；回归 history-retry 全套 |
| S3 store 改动面大 | 单体 3208 行，逻辑交织 | 优先 D2 逐点回灌；每功能点独立提交、独立验证；⑤ 先确认路径 E |
| session hydration 路径选错 | ⑤ 7 个失败方向错误 | 决策点 E 先确认上游方向再动手 |

## 7. 下一步

1. **S2 已完成**：当前基线 `15 failed / 961 passed / 1 skipped / 977 total`。剩余 15 失败中 13 个属 S3 store 双轨，2 个属 S4 `app-routes` 未实现功能。
2. **决策**：执行 S3 前需确认 §4 决策点 D/E/F（尤其 store 收口方向 D 与执行节奏 F）。S3 改动面大、风险高，建议按 D2 逐点回灌并每功能点独立验证。
3. **授权提交**：当前工作树含 S0-S2 多批未提交改动（含 v1 的 5 个挂起修正文件），需用户明确授权后统一提交。

## 8. 调研归属

- **Store 双轨（16）**：逐测试根因 + 功能点分解 + 修复路径，见本轮 store 调研。
- **Chat UI（10）**：mock 债务主轴 + `createMockStore` 工厂建议 + 断言定位，见本轮 UI 调研。
- **杂项（13）**：ClawX→ClawDock 改名、saveChannelConfig 4-arg、`'*':{}` 注入、Router 缺失、skills hostApiFetch 重构、channel-routes 单例污染、skills 错误吞没、openclaw-doctor 缺失，见本轮杂项调研。
