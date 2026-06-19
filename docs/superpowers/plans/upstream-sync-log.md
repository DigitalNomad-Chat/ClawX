# 上游同步日志

> 记录当前二开项目与上游 `ValueCell-ai/ClawX` 的同步历史。

## 同步记录

### 2026-06-18：同步到 v0.4.2

- **上游仓库**：`https://github.com/ValueCell-ai/ClawX`
- **上游版本**：`v0.4.2`
- **上游提交**：`f4e1de6a4118ae3675f13618e89b713f8fa8ce39`
- **当前分支**：`feat/membership-system`
- **合并分支**：`feat/membership-system-merge-v0.4.2`
- **合并提交**：`68147e16`
- **合并基础（merge-base）**：`c1ba38c71b659a93c57262205ba7a1f4969c6145`

#### 合并说明

当前分支实际上已经包含了 v0.4.2 的大部分内容（包括 chat model picker），因为之前的二开工作基于 v0.4.2 内的一个中间提交。本次合并主要完成了：

1. 更新 `package.json` 中的上游跟踪字段
2. 确认当前分支已包含 v0.4.2 的核心功能

#### 冲突处理

| 文件 | 处理方式 |
|------|----------|
| `package.json` | 保留当前分支的 `clawdock` 名称和 `0.4.2-beta.2` 版本号；更新 `upstream` 为 `ValueCell-ai/ClawX@v0.4.2`，`mergeDate` 为 `2026-06-18`，`mergeBase` 为 `c1ba38c7` |

#### 未引入的上游文件

以下文件在当前分支历史中有删除记录，或被二开替代，本次合并未重新引入：

| 文件 | 未引入原因 |
|------|------------|
| `clawx-extensions.json` | 已迁移为 `clawdock-extensions.json` |
| `src/assets/logo.svg` | 已更新为当前品牌 logo |
| `electron/utils/openclaw-doctor.ts` | 功能已迁移到 `electron/gateway/supervisor.ts` |
| `resources/context/AGENTS.clawx.md` | ClawX 品牌文档，当前分支未使用 |
| `resources/context/TOOLS.clawx.md` | ClawX 品牌文档，当前分支未使用 |

#### 验证结果

- ✅ `git status` 干净
- ✅ `pnpm run typecheck` 通过
- ⚠️ 单元测试存在失败，但经对比确认这些失败在合并前的 `feat/membership-system` 分支已存在，非本次合并引入

#### 下一步计划

继续同步上游 **v0.4.4 → v0.4.5**。

---

### 2026-06-18：同步到 v0.4.4（第一阶段）

- **上游仓库**：`https://github.com/ValueCell-ai/ClawX`
- **上游版本**：`v0.4.4`
- **当前分支**：`feat/membership-system`
- **合并范围**：低冲突风险部分（类型定义、store 拆分文件、ArtifactPanel 修复、provider 映射），保留 ClawDock 品牌与自定义功能。

#### 合并说明

本阶段采用"先低耦合后核心"策略：

1. 保留 ClawDock 的 `chat.ts` 核心实现不变，仅在 `ChatState` / `ChatSession` 类型中补充上游新增字段与 action（`derivedTitle`、`renameSession`、`hasMoreHistory`、`historyOffset`），避免新增 store 模块的类型断裂。
2. 保留上游新增的 store 拆分文件：`src/stores/chat/internal.ts`、`store-api.ts`、`session-history-actions.ts`、`session-label-hydration.ts`，并使其与当前类型兼容。
3. 修复 `src/components/file-preview/ArtifactPanel.tsx` 缺失 `useRef` 导入。
4. 移除 Google Gemini CLI OAuth browser provider 的测试断言（该 provider 已移除）。

#### 冲突处理

| 文件 | 处理方式 |
|------|----------|
| `src/stores/chat/types.ts` | 补充 `derivedTitle`、`renameSession`、`hasMoreHistory`、`historyOffset` 类型定义 |
| `src/stores/chat.ts` | 保留 HEAD 主体；增量添加 `renameSession` action 与 `derivedTitle` 解析 |
| `src/stores/chat/session-actions.ts` | 在 session actions 中添加 `renameSession`，解析 `derivedTitle` |
| `src/stores/chat/session-history-actions.ts` | 修正为合并 `sessionActions` 与 `historyActions` |
| `src/components/file-preview/ArtifactPanel.tsx` | 补充 `useRef` import |
| `tests/unit/model-options.test.ts` | 移除 Google Gemini CLI 断言，保留 OpenAI Codex 断言 |

#### 未引入/保留 HEAD 的上游功能

以下功能因与当前 ClawDock 核心实现耦合较高，本阶段未深入合并，后续阶段处理：

- 会话重命名 UI（`Sidebar.tsx` 的 rename UI）
- `Chat/index.tsx` 的会话列表分组 / bucket 逻辑
- `ChatToolbar.tsx` 的 question directory 按钮
- `session-label-hydration.ts` 的完整 hydration 调用链路（当前文件保留但未被 `chat.ts` 调用）
- 上游 v0.4.4 对 `loadSessions` / `loadHistory` 的 retry 与 poll 重构

#### 验证结果

- ✅ `pnpm run typecheck` 通过
- ✅ 指定单元测试通过：`tests/unit/agent-loader.test.ts`、`tests/unit/custom-agent-store.test.ts`、`tests/unit/model-options.test.ts`、`tests/unit/modules/goclaw/custom-agent-editor.test.tsx`、`tests/unit/modules/goclaw/my-agents.test.tsx`、`tests/unit/agent-generation-service.test.ts`
- ⚠️ 全量单元测试仍有失败，主要与 feature-guard / membership 相关，这些失败在本次合并前已存在

#### 下一步计划

继续同步上游 **v0.4.4 → v0.4.5**。

---

### 2026-06-18：同步到 v0.4.4（第二阶段）

- **上游仓库**：`https://github.com/ValueCell-ai/ClawX`
- **上游版本**：`v0.4.4`
- **当前分支**：`feat/membership-system`
- **合并范围**：高耦合核心功能（question directory、loadMoreHistory 显式按钮、Sidebar 重命名 UI），保留 ClawDock 品牌与自定义功能。

#### 合并说明

本阶段完成 v0.4.4 剩余高耦合功能的收尾，全部基于保留 ClawDock 现有实现的选择性移植：

1. **Chat store 状态补齐**
   - 在 `src/stores/chat/types.ts` 的 `ChatState` 中补充 `loadingMoreHistory: boolean`。
   - 在 `src/stores/chat.ts` 初始状态与 `buildSessionSwitchPatch` 中设置 `loadingMoreHistory: false`。
   - 将 `renameSession` 改为异步实现，调用 `hostApiFetch('/api/sessions/rename', ...)` 持久化，并更新本地 `sessions` / `sessionLabels`。

2. **`ChatToolbar.tsx` 移植 question directory 按钮**
   - 新增 `ListTree` import 与 question directory 相关 props。
   - 在右侧按钮组（脱敏切换之后、刷新之前）插入 question directory 切换按钮，保留 NiceAI 渐变 badge、全局脱敏切换、workspace、refresh。

3. **`Sidebar.tsx` 移植会话重命名 UI**
   - 新增 `Pencil`、`Check`、`X`、`Input` import。
   - 新增 `editingSessionKey` / `editingLabel` state 与相关 handlers。
   - 在 agent 分组会话列表中为每项增加编辑态（Input + Check/X）和非编辑态的 Pencil/删除按钮，保留 agent 分组、GoClaw 互斥、固定宽度、module nav、management tools、`UserBadge`、NiceAI 主题。

4. **`Chat/index.tsx` 移植 loadMoreHistory 按钮与 Question Directory 面板**
   - 保留 Virtuoso 虚拟列表，将上游原生滚动的显式 load more 按钮移植为 Virtuoso `Header` 组件。
   - 新增 `QuestionDirectoryItem` 类型、`buildQuestionDirectoryTitle` helper、`questionDirectoryOpenSessionKey` state、相关 memo 与 callback。
   - 把 `ChatToolbar` 调用改为传入 question directory props。
   - 新增 `QuestionDirectory` 组件并在大屏下作为右侧面板渲染。
   - `GeneratedFilesPanel.onOpen` 中通过 `isHtmlPreviewExt(file.ext)` 调用 `openPreview`。
   - 设置 `ChatInput disabled={!isGatewayRunning}`。

5. **补充 i18n 键**
   - `chat.json`：新增 `scrollToLatest`、`loadMoreHistory`、`loadingMoreHistory`、`questionDirectory.title/fallback/moreHint`、`historyBuckets.*`（适配上游 bucket 语义）。
   - `common.json`：新增 `sidebar.renameSession`、`sidebar.renameSessionPlaceholder`、`sidebar.saveSessionRename`、`sidebar.cancelSessionRename`。
   - 覆盖 `zh`、`en`、`ja`、`ru` 四种语言。

6. **`src/lib/generated-files.ts` 补齐 `isHtmlPreviewExt`**
   - 从 v0.4.4 移植该函数，供 `FilePreviewBody.tsx` 与 `Chat/index.tsx` 使用。

#### 冲突处理

| 文件 | 处理方式 |
|------|----------|
| `src/stores/chat/types.ts` | 补充 `loadingMoreHistory` 类型定义 |
| `src/stores/chat.ts` | 将 `renameSession` 改为异步并持久化；补充 `loadingMoreHistory` 初始状态 |
| `src/pages/Chat/ChatToolbar.tsx` | 保留 NiceAI 样式与脱敏切换，插入 question directory 按钮 |
| `src/components/layout/Sidebar.tsx` | 保留 agent 分组与 ClawDock 主题，增加重命名 UI |
| `src/pages/Chat/index.tsx` | 保留 Virtuoso 与执行图逻辑，移植 question directory 与显式 load more 按钮 |
| `src/i18n/locales/*` | 补充 load more / question directory / rename 相关键 |
| `src/lib/generated-files.ts` | 补充 `isHtmlPreviewExt` |

#### 未引入/保留 HEAD 的上游功能

以下功能仍保留 ClawDock 当前实现，未按上游替换：

- 聊天滚动：保留 Virtuoso 虚拟列表，未切回上游原生滚动 + `useStickToBottomInstant`。
- 会话分组：保留按 Agent 分组，未采用上游按时间 bucket 分组。
- Sidebar 宽度：保留固定宽度，未引入可拖拽调整。
- ChatToolbar 样式：保留 NiceAI 渐变 badge 与全局脱敏切换。

#### 验证结果

- ✅ `pnpm run typecheck` 通过
- ✅ 指定单元测试通过：`tests/unit/agent-loader.test.ts`、`tests/unit/custom-agent-store.test.ts`、`tests/unit/model-options.test.ts`、`tests/unit/modules/goclaw/custom-agent-editor.test.tsx`、`tests/unit/modules/goclaw/my-agents.test.tsx`、`tests/unit/agent-generation-service.test.ts`
- ⚠️ 全量单元测试仍有失败，主要与 feature-guard / membership 相关，这些失败在本次合并前已存在

#### 固化记录

- **2026-06-19**：将两阶段移植固化为 merge commit `a80a4560`（parents: 固化前 HEAD `00c53dc0` + v0.4.4 commit `3de1fed4`），工作树干净，`pnpm run typecheck` 通过，`MERGE_HEAD` 已清除。v0.4.4 现为 HEAD 祖先，作为 v0.4.5 选择性移植的安全锚点。
- 执行计划见 `docs/superpowers/plans/2026-06-19-v0.4.4-freeze-and-v0.4.5-selective-merge.md`。

#### 下一步计划

继续同步上游 **v0.4.4 → v0.4.5**。

---

## 版本对照表

| 当前项目版本 | 同步上游版本 | 日期 |
|--------------|--------------|------|
| `0.4.2-beta.2` | `v0.4.2` | 2026-06-18 |
| `0.4.2-beta.2` | `v0.4.4`（第一阶段） | 2026-06-18 |
| `0.4.2-beta.2` | `v0.4.4`（第二阶段） | 2026-06-18 |
| `0.4.2-beta.2` | `v0.4.4`（merge commit 固化 `a80a4560`） | 2026-06-19 |

