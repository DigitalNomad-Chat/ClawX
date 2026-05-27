# 读写空间（Read-Write Workspace）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ChatInput 工具栏新增「读写空间」按钮，用户可选择文件夹作为会话级默认读写目录，通过一次性指令消息告知 AI。

**Architecture:** ChatStore 新增 `rwWorkDir` 状态字段（会话级），ChatInput 渲染按钮和 Popover。选择目录后自动通过 `sendMessage` 发送一条用户消息告知 AI 写 memory，不改动后端。

**Tech Stack:** React, Zustand, Electron IPC (dialog:open), Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/stores/chat/types.ts` | Modify | 新增 `rwWorkDir` 和 `setRwWorkDir` 到 ChatState |
| `src/stores/chat.ts` | Modify | 实现状态初始化、setter、会话切换重置 |
| `src/pages/Chat/ChatInput.tsx` | Modify | 新增按钮、Popover、选择逻辑、指令消息发送 |

---

### Task 1: ChatState 类型定义

**Files:**
- Modify: `src/stores/chat/types.ts:92-131`

- [ ] **Step 1: 在 ChatState interface 中新增 rwWorkDir 字段和 setter**

在 `ChatState` interface 中 `thinkingLevel` 字段之后添加：

```ts
  // Read-Write Workspace (session-scoped, resets on session switch)
  rwWorkDir: string | null;
  setRwWorkDir: (dir: string | null) => void;
```

- [ ] **Step 2: 运行 tsc 验证类型定义**

Run: `cd /Users/a1-6/办公/GitHub/ClawX && npx tsc --noEmit 2>&1 | grep -c "error"`
Expected: 会报错因为 chat.ts 还没实现这些字段，确认有类型错误即可

---

### Task 2: ChatStore 实现

**Files:**
- Modify: `src/stores/chat.ts:1014-1053` (buildSessionSwitchPatch)
- Modify: `src/stores/chat.ts:1658-1698` (newSession)
- Modify: `src/stores/chat.ts` 初始 state 位置

- [ ] **Step 1: 在 store 初始 state 中添加 rwWorkDir**

找到 store 的初始 state 对象（`create<ChatState>()(...)` 内部），在 `thinkingLevel: null,` 后面添加：

```ts
    rwWorkDir: null,
```

- [ ] **Step 2: 添加 setRwWorkDir action**

在 `newSession` action 之前（约 line 1658 前），添加：

```ts
  setRwWorkDir: (dir: string | null) => {
    set({ rwWorkDir: dir });
  },
```

- [ ] **Step 3: 在 buildSessionSwitchPatch 中重置 rwWorkDir**

在 `buildSessionSwitchPatch` 函数返回对象中（`pendingToolImages: [],` 之后），添加：

```ts
    rwWorkDir: null,
```

- [ ] **Step 4: 在 newSession 中重置 rwWorkDir**

在 `newSession` 函数的 `set(...)` 调用中（`pendingToolImages: [],` 之后），添加：

```ts
      rwWorkDir: null,
```

- [ ] **Step 5: 运行 tsc 验证**

Run: `cd /Users/a1-6/办公/GitHub/ClawX && npx tsc --noEmit 2>&1 | grep "ChatInput\|chat\.ts\|chat/types"`
Expected: 无 ChatStore 相关错误

---

### Task 3: ChatInput 按钮 + Popover UI

**Files:**
- Modify: `src/pages/Chat/ChatInput.tsx`

- [ ] **Step 1: 导入新依赖**

在文件顶部 import 区域添加 `FolderOpen` 到 lucide-react 的导入行中：

```ts
import { SendHorizontal, Square, X, Paperclip, FileText, Film, Music, FileArchive, File, Loader2, AtSign, Search, ChevronDown, Shield, Zap, FolderOpen } from 'lucide-react';
```

- [ ] **Step 2: 添加 rwWorkDir 状态和 picker ref**

在 `const [desensitizeOpen, setDesensitizeOpen] = useState(false);` 之后添加：

```ts
  const rwWorkDir = useChatStore((s) => s.rwWorkDir);
  const setRwWorkDir = useChatStore((s) => s.setRwWorkDir);
  const [rwPickerOpen, setRwPickerOpen] = useState(false);
  const rwPickerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: 在外部点击关闭逻辑中添加 rwPickerOpen**

找到 `useEffect` 中监听 `mousedown` 外部点击的逻辑（包含 `pickerOpen`, `skillPickerOpen`, `quickCmdPickerOpen`, `modelPickerOpen` 的那个 effect），在条件判断中添加 `!insideRwPicker` 检查和 `setRwPickerOpen(false)` 调用。

将 `const insideRwPicker = rwPickerRef.current?.contains(target);` 添加到现有的 inside 变量列表中。

将 `setRwPickerOpen(false);` 添加到关闭逻辑中。

将 `rwPickerOpen` 添加到该 useEffect 的依赖数组中。

- [ ] **Step 4: 在 Desensitize 按钮之后、Agent picker 之前插入读写空间按钮和 Popover**

在 `</Button>` (Desensitize 按钮的闭合标签，约 line 1203) 之后，`{showAgentPicker && (` 之前，插入以下代码：

```tsx
            {/* Read-Write Workspace */}
            <div ref={rwPickerRef} className="relative shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors',
                  rwWorkDir && 'bg-primary/10 text-primary hover:bg-primary/20',
                )}
                onClick={() => {
                  setPickerOpen(false);
                  setSkillPickerOpen(false);
                  setQuickCmdPickerOpen(false);
                  setModelPickerOpen(false);
                  setRwPickerOpen((open) => !open);
                }}
                disabled={disabled || sending}
                title={rwWorkDir ? `${t('composer.rwWorkDirSet', '读写空间')}: ${rwWorkDir}` : t('composer.rwWorkDir', '设置读写空间')}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
              {rwPickerOpen && (
                <div className="absolute left-0 bottom-full z-20 mb-2 w-72 overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-card">
                  <div className="px-3 py-2 text-tiny font-medium text-muted-foreground/80">
                    {t('composer.rwWorkDirTitle', '读写空间')}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentAgent?.workspace) return;
                      const docsDir = `${currentAgent.workspace}/docs`;
                      setRwWorkDir(docsDir);
                      setRwPickerOpen(false);
                      onSend(
                        `请将以下目录设置为本次会话的默认读写工作目录。后续文件读写操作默认使用此路径（除非我明确指定其他路径）。请将此设置写入你的 memory 以便会话内持续生效。\n\n目录：${docsDir}`,
                      );
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-meta font-medium text-foreground">
                        {currentAgentName} Workspace/docs
                      </div>
                      <div className="truncate text-tiny text-muted-foreground">
                        {currentAgent?.workspace ? `${currentAgent.workspace}/docs` : '—'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await invokeIpc('dialog:open', {
                          properties: ['openDirectory'],
                        }) as { canceled: boolean; filePaths?: string[] };
                        if (result.canceled || !result.filePaths?.[0]) return;
                        const selectedDir = result.filePaths[0];
                        setRwWorkDir(selectedDir);
                        setRwPickerOpen(false);
                        onSend(
                          `请将以下目录设置为本次会话的默认读写工作目录。后续文件读写操作默认使用此路径（除非我明确指定其他路径）。请将此设置写入你的 memory 以便会话内持续生效。\n\n目录：${selectedDir}`,
                        );
                      } catch (err) {
                        toast.error(t('composer.rwWorkDirPickFailed', '选择目录失败'));
                      }
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-meta font-medium text-foreground">
                        {t('composer.rwWorkDirCustom', '自定义目录...')}
                      </div>
                      <div className="text-tiny text-muted-foreground">
                        {t('composer.rwWorkDirCustomHint', '选择任意本地文件夹')}
                      </div>
                    </div>
                  </button>
                  {rwWorkDir && (
                    <>
                      <div className="my-1 border-t border-black/5 dark:border-white/10" />
                      <button
                        type="button"
                        onClick={() => {
                          const clearedDir = rwWorkDir;
                          setRwWorkDir(null);
                          setRwPickerOpen(false);
                          onSend(
                            `请清除之前设置的默认读写工作目录（${clearedDir}），后续文件读写恢复自由选择路径。请同步更新你的 memory。`,
                          );
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-meta text-destructive transition-colors hover:bg-destructive/5"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('composer.rwWorkDirClear', '清除设置')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
```

- [ ] **Step 5: 运行 tsc 验证**

Run: `cd /Users/a1-6/办公/GitHub/ClawX && npx tsc --noEmit 2>&1 | grep "ChatInput"`
Expected: 无错误

---

### Task 4: 现有测试验证

- [ ] **Step 1: 运行现有 ChatInput 测试**

Run: `cd /Users/a1-6/办公/GitHub/ClawX && npx vitest run tests/unit/chat-input.test.tsx`
Expected: 所有测试通过

- [ ] **Step 2: 运行全量 tsc**

Run: `cd /Users/a1-6/办公/GitHub/ClawX && npx tsc --noEmit 2>&1 | grep -c "error"`
Expected: 仅包含本次修改前已存在的错误（如 kernel-llm-config.ts 等），无新增错误
