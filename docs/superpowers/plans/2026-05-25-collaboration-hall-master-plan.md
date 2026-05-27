# Collaboration Hall 功能完善总体规划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ClawX 项目协作大厅功能从当前 72% 覆盖率提升至 95%+，补齐测试覆盖、SSE 真流式、任务房间子系统、意图分类、看门狗自愈五大核心模块。

**Architecture:** 基于现有 `electron/modules/collaboration/` 和 `src/modules/collaboration/` 架构进行渐进增强。所有新模块遵循现有 JsonStore + REST API + SSE EventBus + React 组件的技术栈。测试使用 Vitest。

**Tech Stack:** TypeScript, Electron, React, Zustand, JsonStore, SSE, Vitest, Tailwind CSS, shadcn/ui

---

## 一、项目现状与目标

### 1.1 现状评估

当前项目协作大厅功能覆盖度约 **72%**。核心链路（runtimeDispatch、结构化输出、讨论周期、执行锁、HALL.md）已打通，但存在以下核心缺失：

| 优先级 | 缺失项 | 影响 |
|--------|--------|------|
| P0 | 测试覆盖为零 | 任何改动无法自动验证 |
| P0 | SSE 伪流式（后端轮询） | 延迟高，体验差 |
| P0 | 任务房间（Room）子系统缺失 | 复杂任务无法独立推进 |
| P1 | 意图分类系统缺失 | 调度策略不够智能 |
| P1 | 看门狗/自愈/监控缺失 | 生产环境风险 |
| P2 | UI/UX 体验待优化 | 三栏布局、动效、响应式 |

### 1.2 目标

- **4 周后**：测试覆盖率达到 60%+，SSE 真流式实现，Room 子系统 MVP 可用
- **7 周后**：意图分类、看门狗、操作审计完成，整体覆盖率达到 90%+
- **8 周后**：UI/UX 优化完成，整体覆盖率达到 95%+

---

## 二、文件结构总览

### 2.1 新增/修改的后端文件

```
electron/modules/collaboration/
├── __tests__/                          # 新增：测试目录
│   ├── store.test.ts
│   ├── runtime-dispatch.test.ts
│   ├── orchestrator.test.ts
│   ├── speaker-policy.test.ts
│   ├── mention-router.test.ts
│   ├── role-resolver.test.ts
│   ├── handoff-validator.test.ts
│   ├── content-sanitizer.test.ts
│   ├── prompt-builder.test.ts
│   ├── budget-governance.test.ts
│   ├── deliverable-enforcer.test.ts
│   ├── task-lifecycle.test.ts
│   ├── persona-loader.test.ts
│   ├── event-publisher.test.ts
│   ├── stream-manager.test.ts
│   ├── routes-api.test.ts
│   └── orchestrator-scheduler.test.ts
│
├── index.ts                            # 修改：注册 room 模块、启动看门狗
├── routes.ts                           # 修改：新增 room 相关端点
│
├── room/                               # 新增：任务房间子系统
│   ├── index.ts                        # Room 模块入口
│   ├── types.ts                        # Room 专属类型（与 hall 共享基础类型）
│   ├── store.ts                        # Room CRUD + 持久化
│   ├── orchestrator.ts                 # Room 生命周期编排
│   └── routes.ts                       # Room REST API
│
├── intent-classifier.ts                # 新增：意图分类系统
├── watchdog.ts                         # 新增：看门狗监控
├── auto-heal.ts                        # 新增：自愈逻辑
├── audit-store.ts                      # 新增：操作审计存储
│
├── runtime-dispatch.ts                 # 修改：集成意图分类、真流式适配
├── prompt-builder.ts                   # 修改：根据意图调整 prompt
├── event-publisher.ts                  # 修改：新增 room 事件类型
└── stream-manager.ts                   # 修改：支持 room 事件流
```

### 2.2 新增/修改的前端文件

```
src/modules/collaboration/
├── __tests__/                          # 新增：前端测试
│   ├── CollaborationPage.test.tsx
│   ├── MessageStream.test.tsx
│   ├── TaskCardDetail.test.tsx
│   ├── DecisionPanel.test.tsx
│   ├── ExecutionPlanView.test.tsx
│   ├── MentionInput.test.tsx
│   └── useCollabStream.test.ts
│
├── CollaborationPage.tsx               # 修改：三栏布局
├── store.ts                            # 修改：新增 room 状态管理
├── hooks/
│   ├── useCollabStream.ts              # 修改：支持 room 事件
│   └── useWatchdogStatus.ts            # 新增：看门狗状态
│
├── components/
│   ├── RoomWorkbench.tsx               # 新增：任务房间工作台
│   ├── RoomMessageStream.tsx           # 新增：房间消息流
│   ├── RoomList.tsx                    # 新增：房间列表
│   ├── ContextPanel.tsx                # 新增：右侧上下文面板（三栏）
│   ├── TaskCardList.tsx                # 新增：左侧任务卡列表（三栏）
│   ├── MemberStatusBar.tsx             # 提取：从 CollaborationPage 提取
│   └── ...
│
└── i18n/index.ts                       # 修改：新增 room 相关文案
```

---

## 三、分阶段执行计划

---

## Chunk 1: 测试基础设施 + Store 层测试

**目标：** 搭建测试环境，完成数据存储层的全面测试。这是所有后续工作的基础。

**预估时间：** 3-4 天

### Task 1.1: 搭建测试环境

**Files:**
- Create: `vitest.config.ts` (如果不存在)
- Modify: `package.json`

- [ ] **Step 1: 检查现有测试配置**

```bash
cat vitest.config.ts 2>/dev/null || echo "No vitest config found"
cat package.json | grep -A5 '"test"'
```

- [ ] **Step 2: 安装测试依赖**

```bash
pnpm add -D vitest @vitest/ui @vitest/coverage-v8 supertest @types/supertest
```

- [ ] **Step 3: 创建/更新 vitest 配置**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['electron/modules/collaboration/**/*.ts', 'src/modules/collaboration/**/*.ts'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
    },
  },
});
```

- [ ] **Step 4: 添加测试脚本到 package.json**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json

git commit -m "chore(test): setup vitest and coverage for collaboration module"
```

### Task 1.2: Store 层测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/store.test.ts`
- Reference: `electron/modules/collaboration/store.ts`

- [ ] **Step 1: 编写 Hall Store 测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadHallStore,
  loadMessageStore,
  loadTaskCardStore,
  getHall,
  listMessages,
  listTaskCards,
  getTaskCard,
  appendMessage,
  createTaskCard,
  updateTaskCard,
  archiveTaskCard,
  deleteTaskCard,
  acquireExecutionLock,
  releaseExecutionLock,
  getActiveLock,
  DEFAULT_COLLABORATION_HALL_ID,
} from '../store';
import type { HallParticipant } from '../types';

describe('Hall Store', () => {
  beforeEach(async () => {
    // Reset stores by writing empty state
    const { JsonStore } = await import('../../_shared/json-store');
    // ... 清理逻辑
  });

  it('should create default hall', async () => {
    const store = await loadHallStore();
    const hall = getHall(store);
    expect(hall).toBeDefined();
    expect(hall?.hallId).toBe(DEFAULT_COLLABORATION_HALL_ID);
  });

  it('should create and retrieve task card', async () => {
    const taskCard = await createTaskCard({
      title: 'Test Task',
      description: 'Test Description',
      createdByParticipantId: 'user-1',
      stage: 'discussion',
      status: 'todo',
    });

    expect(taskCard.taskCardId).toBeDefined();
    expect(taskCard.title).toBe('Test Task');

    const tStore = await loadTaskCardStore();
    const found = getTaskCard(tStore, taskCard.taskCardId);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Test Task');
  });

  it('should acquire and release execution lock', async () => {
    const taskCard = await createTaskCard({
      title: 'Lock Test',
      description: 'Lock Description',
      createdByParticipantId: 'user-1',
    });

    await acquireExecutionLock(
      taskCard.taskCardId,
      'participant-1',
      'agent-1',
      'Test Lock',
    );

    const lock = await getActiveLock(taskCard.taskCardId);
    expect(lock).toBeDefined();
    expect(lock?.participantId).toBe('participant-1');

    await releaseExecutionLock(taskCard.taskCardId, 'test_release');
    const released = await getActiveLock(taskCard.taskCardId);
    expect(released).toBeUndefined();
  });

  it('should prevent concurrent lock acquisition', async () => {
    const taskCard = await createTaskCard({
      title: 'Concurrent Lock Test',
      description: 'Test',
      createdByParticipantId: 'user-1',
    });

    await acquireExecutionLock(taskCard.taskCardId, 'p1', 'agent-1', 'Lock 1');

    // Second lock should fail or replace based on implementation
    await expect(
      acquireExecutionLock(taskCard.taskCardId, 'p2', 'agent-2', 'Lock 2'),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 编写 Message Store 测试**

```typescript
describe('Message Store', () => {
  it('should append and list messages', async () => {
    const message = await appendMessage({
      hallId: DEFAULT_COLLABORATION_HALL_ID,
      authorParticipantId: 'user-1',
      authorLabel: 'User',
      content: 'Hello World',
      taskCardId: 'task-1',
    });

    expect(message.messageId).toBeDefined();
    expect(message.content).toBe('Hello World');

    const mStore = await loadMessageStore();
    const messages = listMessages(mStore, { hallId: DEFAULT_COLLABORATION_HALL_ID });
    expect(messages.length).toBeGreaterThan(0);
  });

  it('should filter messages by taskCardId', async () => {
    await appendMessage({
      hallId: DEFAULT_COLLABORATION_HALL_ID,
      authorParticipantId: 'user-1',
      authorLabel: 'User',
      content: 'Task A message',
      taskCardId: 'task-a',
    });

    await appendMessage({
      hallId: DEFAULT_COLLABORATION_HALL_ID,
      authorParticipantId: 'user-1',
      authorLabel: 'User',
      content: 'Task B message',
      taskCardId: 'task-b',
    });

    const mStore = await loadMessageStore();
    const taskAMessages = listMessages(mStore, { taskCardId: 'task-a' });
    expect(taskAMessages.every(m => m.taskCardId === 'task-a')).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test electron/modules/collaboration/__tests__/store.test.ts
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add electron/modules/collaboration/__tests__/store.test.ts
git commit -m "test(store): add comprehensive store layer tests"
```

### Task 1.3: Speaker Policy 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/speaker-policy.test.ts`
- Reference: `electron/modules/collaboration/speaker-policy.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildDiscussionParticipantQueue,
  openDiscussionCycle,
  markDiscussionSpeakerComplete,
  closeDiscussionCycle,
  resolveNextDiscussionSpeaker,
  resolveDefaultSpeakerForStage,
} from '../speaker-policy';
import type { HallParticipant, HallTaskCard } from '../types';

describe('Speaker Policy', () => {
  const mockParticipants: HallParticipant[] = [
    { participantId: 'p1', agentId: 'agent-1', displayName: 'Planner', semanticRole: 'planner', aliases: [], active: true, isHuman: false },
    { participantId: 'p2', agentId: 'agent-2', displayName: 'Coder', semanticRole: 'coder', aliases: [], active: true, isHuman: false },
    { participantId: 'p3', agentId: 'agent-3', displayName: 'Reviewer', semanticRole: 'reviewer', aliases: [], active: true, isHuman: false },
    { participantId: 'p4', agentId: 'agent-4', displayName: 'Manager', semanticRole: 'manager', aliases: [], active: true, isHuman: false },
  ];

  it('should build discussion queue in role order', () => {
    const queue = buildDiscussionParticipantQueue(mockParticipants);
    expect(queue).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('should open discussion cycle', () => {
    const taskCard: HallTaskCard = {
      taskCardId: 'task-1',
      hallId: 'main',
      title: 'Test',
      description: 'Test',
      stage: 'discussion',
      status: 'todo',
      createdByParticipantId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blockers: [],
      artifactRefs: [],
      executionLog: [],
      plannedExecutionItems: [],
    };

    const updated = openDiscussionCycle(taskCard, 'user-1', mockParticipants);
    expect(updated.discussionCycle).toBeDefined();
    expect(updated.discussionCycle?.expectedParticipantIds).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(updated.discussionCycle?.completedParticipantIds).toEqual([]);
  });

  it('should resolve next speaker correctly', () => {
    const taskCard: HallTaskCard = {
      taskCardId: 'task-1',
      hallId: 'main',
      title: 'Test',
      description: 'Test',
      stage: 'discussion',
      status: 'todo',
      createdByParticipantId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blockers: [],
      artifactRefs: [],
      executionLog: [],
      plannedExecutionItems: [],
      discussionCycle: {
        cycleId: 'cycle-1',
        openedAt: new Date().toISOString(),
        openedByParticipantId: 'user-1',
        expectedParticipantIds: ['p1', 'p2', 'p3', 'p4'],
        completedParticipantIds: ['p1'],
      },
    };

    const next = resolveNextDiscussionSpeaker(taskCard);
    expect(next).toBe('p2');
  });

  it('should mark speaker complete', () => {
    const taskCard: HallTaskCard = {
      taskCardId: 'task-1',
      hallId: 'main',
      title: 'Test',
      description: 'Test',
      stage: 'discussion',
      status: 'todo',
      createdByParticipantId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blockers: [],
      artifactRefs: [],
      executionLog: [],
      plannedExecutionItems: [],
      discussionCycle: {
        cycleId: 'cycle-1',
        openedAt: new Date().toISOString(),
        openedByParticipantId: 'user-1',
        expectedParticipantIds: ['p1', 'p2'],
        completedParticipantIds: [],
      },
    };

    const updated = markDiscussionSpeakerComplete(taskCard, 'p1');
    expect(updated.discussionCycle?.completedParticipantIds).toContain('p1');
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
pnpm test electron/modules/collaboration/__tests__/speaker-policy.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/modules/collaboration/__tests__/speaker-policy.test.ts
git commit -m "test(speaker-policy): add discussion cycle tests"
```

---

## Chunk 2: 运行时调度 + 内容处理测试

**目标：** 完成 runtime-dispatch、content-sanitizer、prompt-builder、mention-router、role-resolver、handoff-validator 的测试覆盖。

**预估时间：** 3-4 天

### Task 2.1: Content Sanitizer 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/content-sanitizer.test.ts`
- Reference: `electron/modules/collaboration/content-sanitizer.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeAgentReply, inferHallResponseLanguage } from '../content-sanitizer';

describe('Content Sanitizer', () => {
  it('should extract structured block from agent reply', () => {
    const reply = `Here is my analysis.

<hall-structured>
{
  "proposal": "Use React Query",
  "decision": "Approved",
  "doneWhen": "All tests pass"
}
</hall-structured>`;

    const result = sanitizeAgentReply(reply);
    expect(result.visibleText).toContain('Here is my analysis');
    expect(result.structuredBlock).toBeDefined();
    expect(result.structuredBlock?.proposal).toBe('Use React Query');
  });

  it('should remove ANSI codes', () => {
    const reply = '\x1b[32mSuccess\x1b[0m message';
    const result = sanitizeAgentReply(reply);
    expect(result.visibleText).not.toContain('\x1b');
  });

  it('should detect Chinese language', () => {
    const text = '这是一个中文回复。任务已经完成。';
    expect(inferHallResponseLanguage(text)).toBe('zh');
  });

  it('should detect English language', () => {
    const text = 'This is an English reply. The task is done.';
    expect(inferHallResponseLanguage(text)).toBe('en');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/content-sanitizer.test.ts
git commit -m "test(content-sanitizer): add structured block extraction and language detection tests"
```

### Task 2.2: Mention Router 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/mention-router.test.ts`
- Reference: `electron/modules/collaboration/mention-router.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveMentionTargets } from '../mention-router';
import type { HallParticipant } from '../types';

describe('Mention Router', () => {
  const participants: HallParticipant[] = [
    { participantId: 'p1', displayName: 'Planner', semanticRole: 'planner', aliases: ['plan'], active: true, isHuman: false },
    { participantId: 'p2', displayName: 'Coder', semanticRole: 'coder', aliases: ['code', 'dev'], active: true, isHuman: false },
    { participantId: 'p3', displayName: 'Reviewer', semanticRole: 'reviewer', aliases: ['review'], active: true, isHuman: false },
  ];

  it('should resolve single mention', () => {
    const result = resolveMentionTargets('@Planner please help', participants);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].participantId).toBe('p1');
  });

  it('should resolve alias mention', () => {
    const result = resolveMentionTargets('@code review this', participants);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].participantId).toBe('p2');
  });

  it('should broadcast to all with @all', () => {
    const result = resolveMentionTargets('@all please review', participants);
    expect(result.broadcastAll).toBe(true);
    expect(result.targets).toHaveLength(3);
  });

  it('should resolve multiple mentions', () => {
    const result = resolveMentionTargets('@Planner and @Coder help', participants);
    expect(result.targets).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/mention-router.test.ts
git commit -m "test(mention-router): add mention resolution tests"
```

### Task 2.3: Role Resolver 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/role-resolver.test.ts`
- Reference: `electron/modules/collaboration/role-resolver.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { pickPrimaryParticipantByRole, inferDiscussionDomain } from '../role-resolver';
import type { HallParticipant } from '../types';

describe('Role Resolver', () => {
  const participants: HallParticipant[] = [
    { participantId: 'p1', displayName: 'Planner', semanticRole: 'planner', aliases: [], active: true, isHuman: false },
    { participantId: 'p2', displayName: 'Coder', semanticRole: 'coder', aliases: [], active: true, isHuman: false },
    { participantId: 'p3', displayName: 'Reviewer', semanticRole: 'reviewer', aliases: [], active: true, isHuman: false },
  ];

  it('should pick primary participant by role', () => {
    const found = pickPrimaryParticipantByRole(participants, 'coder');
    expect(found?.participantId).toBe('p2');
  });

  it('should infer engineering domain', () => {
    const domain = inferDiscussionDomain('我们需要重构这个 API 接口');
    expect(domain).toBe('engineering');
  });

  it('should infer creative domain', () => {
    const domain = inferDiscussionDomain('设计一个新的 Logo');
    expect(domain).toBe('creative');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/role-resolver.test.ts
git commit -m "test(role-resolver): add role resolution and domain inference tests"
```

### Task 2.4: Handoff Validator 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/handoff-validator.test.ts`
- Reference: `electron/modules/collaboration/handoff-validator.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { validateHandoffPacket } from '../handoff-validator';
import type { StructuredHandoffPacket } from '../types';

describe('Handoff Validator', () => {
  it('should validate complete handoff packet', () => {
    const packet: StructuredHandoffPacket = {
      goal: 'Complete user authentication',
      currentResult: 'Implemented login form with validation',
      doneWhen: 'All auth tests pass',
      blockers: [],
      nextOwner: 'p2',
      requiresInputFrom: [],
    };

    const result = validateHandoffPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty goal', () => {
    const packet: StructuredHandoffPacket = {
      goal: '',
      currentResult: 'Some result',
      doneWhen: 'Tests pass',
      blockers: [],
      nextOwner: 'p2',
      requiresInputFrom: [],
    };

    const result = validateHandoffPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'goal')).toBe(true);
  });

  it('should reject invalid nextOwner', () => {
    const packet: StructuredHandoffPacket = {
      goal: 'Valid goal',
      currentResult: 'Valid result',
      doneWhen: 'Tests pass',
      blockers: [],
      nextOwner: '',
      requiresInputFrom: [],
    };

    const result = validateHandoffPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'nextOwner')).toBe(true);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/handoff-validator.test.ts
git commit -m "test(handoff-validator): add handoff packet validation tests"
```

### Task 2.5: Budget Governance 测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/budget-governance.test.ts`
- Reference: `electron/modules/collaboration/budget-governance.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { estimateTokenCount, checkTaskBudget } from '../budget-governance';

describe('Budget Governance', () => {
  it('should estimate CJK tokens', () => {
    const text = '这是一个中文测试文本';
    const estimate = estimateTokenCount(text);
    // CJK chars: roughly 2 chars per token
    expect(estimate).toBeGreaterThan(0);
  });

  it('should estimate Latin tokens', () => {
    const text = 'This is a test text for token estimation';
    const estimate = estimateTokenCount(text);
    // Latin: roughly 4 chars per token
    expect(estimate).toBeGreaterThan(0);
  });

  it('should allow budget within limit', async () => {
    const taskCard = {
      taskCardId: 'task-1',
      budgetLimit: 10000,
      budgetAlertThreshold: 5000,
    };

    const result = await checkTaskBudget(taskCard as any);
    expect(result.allowed).toBe(true);
  });

  it('should reject budget over limit', async () => {
    const taskCard = {
      taskCardId: 'task-1',
      budgetLimit: 100,
      budgetAlertThreshold: 150,
    };

    const result = await checkTaskBudget(taskCard as any);
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/budget-governance.test.ts
git commit -m "test(budget-governance): add token estimation and budget limit tests"
```

---

## Chunk 3: API 路由测试 + Stream Manager 测试

**目标：** 完成 REST API 端点和 SSE Stream Manager 的测试覆盖。

**预估时间：** 3-4 天

### Task 3.1: API 路由测试

**Files:**
- Create: `electron/modules/collaboration/__tests__/routes-api.test.ts`
- Reference: `electron/modules/collaboration/routes.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';

describe('Collaboration API Routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Setup test server with collaboration routes
    // This is a simplified example - actual implementation depends on your server setup
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/collaboration/overview should return hall data', async () => {
    const response = await fetch(`${baseUrl}/api/collaboration/overview`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.hall).toBeDefined();
  });

  it('POST /api/collaboration/task-cards should create task', async () => {
    const response = await fetch(`${baseUrl}/api/collaboration/task-cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Task',
        description: 'Test Description',
        createdByParticipantId: 'user-1',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.taskCard.title).toBe('Test Task');
  });

  it('POST /api/collaboration/messages should create message', async () => {
    const response = await fetch(`${baseUrl}/api/collaboration/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorParticipantId: 'user-1',
        authorLabel: 'User',
        content: 'Test message',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message.content).toBe('Test message');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/__tests__/routes-api.test.ts
git commit -m "test(routes): add REST API endpoint tests"
```

---

## Chunk 4: SSE 真流式传输实现

**目标：** 将 SSE 从轮询模式升级为真流式传输（或优化到体验无法区分）。

**预估时间：** 5-7 天

### 4.1 设计决策

**方案 A（推荐）：Gateway 流式适配层**
- 在 `runtime-dispatch.ts` 中，不轮询 `chat.history`，而是使用 Gateway 的流式接口（如果支持）
- 如果 Gateway 不支持流式，则保持轮询但优化为 websocket 或长轮询

**方案 B（备选）：轮询优化**
- 缩短轮询间隔（从 3 秒到 500ms）
- 使用 `EventSource` 的自定义事件推送增量内容
- 添加 `draft_start` 事件

**本计划采用方案 B**（因为 Gateway 层不可控，优化现有轮询更现实）。

### Task 4.1: 添加 draft_start 事件和生命周期管理

**Files:**
- Modify: `electron/modules/collaboration/runtime-dispatch.ts`
- Modify: `electron/modules/collaboration/stream-publisher.ts`
- Modify: `src/modules/collaboration/hooks/useCollabStream.ts`

- [ ] **Step 1: 修改 stream-publisher.ts 添加 publishDraftStart**

```typescript
// electron/modules/collaboration/stream-publisher.ts
export function publishDraftStart(input: StreamPublishInput): void {
  publishCollabEvent({
    type: "invalidate",
    hallId: input.hallId,
    taskCardId: input.taskCardId,
    reason: "draft_start",
    payload: {
      draftId: input.draftId,
      participantId: input.participantId,
      participantLabel: input.participantLabel,
      timestamp: new Date().toISOString(),
    },
  });
}
```

- [ ] **Step 2: 修改 runtime-dispatch.ts 添加 draft_start 推送**

在 `chat.send` 调用成功后立即推送 `draft_start`：

```typescript
// 在 runtime-dispatch.ts 的 Phase 1 之后
publishCollabEvent({
  type: "invalidate",
  hallId: hall.hallId,
  taskCardId: taskCard.taskCardId,
  reason: "draft_start",
  payload: {
    draftId,
    authorLabel: participant.displayName,
    authorSemanticRole: participant.semanticRole,
  },
});
```

- [ ] **Step 3: 修改 useCollabStream.ts 处理 draft_start**

```typescript
// src/modules/collaboration/hooks/useCollabStream.ts
export interface UseCollabStreamOptions {
  // ... existing options
  onDraftStart?: (draftId: string, extra?: Record<string, unknown>) => void;
}

// 在 connect 函数中：
es.addEventListener('draft_start', (e) => {
  const data = JSON.parse((e as MessageEvent).data);
  const { draftId, ...extra } = data;
  optionsRef.current?.onDraftStart?.(draftId as string, extra);
});
```

- [ ] **Step 4: 修改 MessageStream.tsx 处理 draft_start**

```typescript
// 在 MessageStream.tsx 中
const handleDraftStart = useCallback((draftId: string, extra: Record<string, unknown>) => {
  setDrafts(prev => {
    if (prev.some(d => d.draftId === draftId)) return prev;
    return [...prev, {
      draftId,
      authorLabel: extra.authorLabel as string,
      authorSemanticRole: extra.authorSemanticRole as string,
      content: '',
      status: 'streaming',
      createdAt: Date.now(),
    }];
  });
}, []);

// 在 useCollabStream 调用中：
useCollabStream({
  onDraftStart: handleDraftStart,
  // ... other handlers
});
```

- [ ] **Step 5: 运行测试**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add electron/modules/collaboration/stream-publisher.ts electron/modules/collaboration/runtime-dispatch.ts src/modules/collaboration/hooks/useCollabStream.ts src/modules/collaboration/components/MessageStream.tsx

git commit -m "feat(streaming): add draft_start event and lifecycle management"
```

### Task 4.2: 缩短轮询间隔 + 添加退避策略

**Files:**
- Modify: `electron/modules/collaboration/runtime-dispatch.ts`

- [ ] **Step 1: 优化 pollHistoryForAssistantReply**

```typescript
// electron/modules/collaboration/runtime-dispatch.ts
async function pollHistoryForAssistantReply(
  ctx: HostApiContext,
  sessionKey: string,
  timeoutMs: number,
  onDelta?: (delta: string, fullText: string) => void,
): Promise<string | null> {
  // 动态轮询间隔：开始快，后面慢
  const FAST_POLL_INTERVAL = 500;   // 500ms for first 10 seconds
  const NORMAL_POLL_INTERVAL = 2000; // 2s after
  const SLOW_POLL_INTERVAL = 3000;   // 3s after 30 seconds

  const deadline = Date.now() + timeoutMs;
  let previousMessageCount = 0;
  let lastAssistantText = '';
  let pollStartTime = Date.now();

  while (Date.now() < deadline) {
    const elapsed = Date.now() - pollStartTime;
    let interval = SLOW_POLL_INTERVAL;
    if (elapsed < 10000) interval = FAST_POLL_INTERVAL;
    else if (elapsed < 30000) interval = NORMAL_POLL_INTERVAL;

    await new Promise((r) => setTimeout(r, interval));

    // ... rest of polling logic
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/runtime-dispatch.ts

git commit -m "perf(streaming): optimize polling with dynamic intervals (500ms/2s/3s)"
```

---

## Chunk 5: 任务房间（Room）子系统 MVP

**目标：** 实现任务房间的 CRUD、消息流、阶段流转。

**预估时间：** 10-14 天

### Task 5.1: Room 类型定义

**Files:**
- Create: `electron/modules/collaboration/room/types.ts`

- [ ] **Step 1: 定义 Room 类型**

```typescript
// electron/modules/collaboration/room/types.ts
import type { HallParticipant, HallMessage, TaskArtifact } from '../types';

export type RoomStage = 'intake' | 'discussion' | 'assigned' | 'executing' | 'review' | 'completed';

export interface ChatRoom {
  roomId: string;
  taskCardId: string;
  hallId: string;
  title: string;
  description: string;
  stage: RoomStage;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  currentOwnerParticipantId?: string;
  currentOwnerLabel?: string;
  participants: HallParticipant[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  blockers: string[];
  artifactRefs: TaskArtifact[];
  sessionKeys?: string[];
}

export interface ChatMessage {
  messageId: string;
  roomId: string;
  authorParticipantId: string;
  authorLabel: string;
  authorSemanticRole?: string;
  content: string;
  kind: 'chat' | 'proposal' | 'decision' | 'handoff' | 'status' | 'system';
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface RoomStoreSnapshot {
  rooms: ChatRoom[];
  messages: ChatMessage[];
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/room/types.ts

git commit -m "feat(room): add room subsystem type definitions"
```

### Task 5.2: Room Store 层

**Files:**
- Create: `electron/modules/collaboration/room/store.ts`

- [ ] **Step 1: 实现 Room Store**

```typescript
// electron/modules/collaboration/room/store.ts
import { randomUUID } from "node:crypto";
import { JsonStore } from "../../_shared/json-store";
import { getModuleFilePath } from "../../_shared/runtime-path";
import { publishCollabEvent } from "../event-publisher";
import type { ChatRoom, ChatMessage, RoomStoreSnapshot, RoomStage } from "./types";

const ROOM_STORE_PATH = getModuleFilePath("collaboration", "rooms.json");

let roomStore: JsonStore<RoomStoreSnapshot> | null = null;

function getRoomStore(): JsonStore<RoomStoreSnapshot> {
  if (!roomStore) {
    roomStore = new JsonStore<RoomStoreSnapshot>({
      filePath: ROOM_STORE_PATH,
      defaultValue: { rooms: [], messages: [], updatedAt: new Date(0).toISOString() },
      schemaVersion: 1,
    });
  }
  return roomStore;
}

export async function loadRoomStore(): Promise<RoomStoreSnapshot> {
  return getRoomStore().read();
}

export async function createRoom(input: {
  taskCardId: string;
  hallId: string;
  title: string;
  description: string;
  participants: ChatRoom['participants'];
  createdByParticipantId: string;
}): Promise<ChatRoom> {
  const store = await loadRoomStore();
  const now = new Date().toISOString();

  const room: ChatRoom = {
    roomId: randomUUID(),
    taskCardId: input.taskCardId,
    hallId: input.hallId,
    title: input.title,
    description: input.description,
    stage: 'intake',
    status: 'todo',
    participants: input.participants,
    createdAt: now,
    updatedAt: now,
    blockers: [],
    artifactRefs: [],
  };

  store.rooms.push(room);
  store.updatedAt = now;
  await getRoomStore().write(store);

  publishCollabEvent({
    type: "room_created",
    hallId: input.hallId,
    taskCardId: input.taskCardId,
    payload: { room },
  });

  return room;
}

export async function getRoom(store: RoomStoreSnapshot, roomId: string): Promise<ChatRoom | undefined> {
  return store.rooms.find((r) => r.roomId === roomId);
}

export async function updateRoom(
  roomId: string,
  updates: Partial<Omit<ChatRoom, 'roomId' | 'createdAt'>>,
): Promise<ChatRoom> {
  const store = await loadRoomStore();
  const idx = store.rooms.findIndex((r) => r.roomId === roomId);
  if (idx === -1) throw new Error(`Room '${roomId}' not found`);

  const now = new Date().toISOString();
  store.rooms[idx] = { ...store.rooms[idx], ...updates, updatedAt: now };
  store.updatedAt = now;
  await getRoomStore().write(store);

  publishCollabEvent({
    type: "room_updated",
    hallId: store.rooms[idx].hallId,
    taskCardId: store.rooms[idx].taskCardId,
    payload: { room: store.rooms[idx] },
  });

  return store.rooms[idx];
}

export async function appendRoomMessage(input: {
  roomId: string;
  authorParticipantId: string;
  authorLabel: string;
  authorSemanticRole?: string;
  content: string;
  kind?: ChatMessage['kind'];
  payload?: Record<string, unknown>;
}): Promise<ChatMessage> {
  const store = await loadRoomStore();
  const room = store.rooms.find((r) => r.roomId === input.roomId);
  if (!room) throw new Error(`Room '${input.roomId}' not found`);

  const message: ChatMessage = {
    messageId: randomUUID(),
    roomId: input.roomId,
    authorParticipantId: input.authorParticipantId,
    authorLabel: input.authorLabel,
    authorSemanticRole: input.authorSemanticRole,
    content: input.content,
    kind: input.kind || 'chat',
    createdAt: new Date().toISOString(),
    payload: input.payload,
  };

  store.messages.push(message);
  store.updatedAt = new Date().toISOString();
  await getRoomStore().write(store);

  publishCollabEvent({
    type: "room_message_created",
    hallId: room.hallId,
    roomId: input.roomId,
    payload: { message },
  });

  return message;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/room/store.ts

git commit -m "feat(room): add room store with CRUD and message persistence"
```

### Task 5.3: Room API 路由

**Files:**
- Create: `electron/modules/collaboration/room/routes.ts`

- [ ] **Step 1: 实现 Room 路由**

```typescript
// electron/modules/collaboration/room/routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostApiContext } from "../../api/context";
import { parseJsonBody, sendJson } from "../../api/route-utils";
import { loadRoomStore, createRoom, getRoom, updateRoom, appendRoomMessage } from "./store";

export async function handleRoomRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  const pathname = url.pathname;

  // GET /api/collaboration/rooms
  if (pathname === "/api/collaboration/rooms" && req.method === "GET") {
    try {
      const store = await loadRoomStore();
      const hallId = url.searchParams.get("hallId")?.trim() || undefined;
      const rooms = hallId
        ? store.rooms.filter((r) => r.hallId === hallId)
        : store.rooms;
      sendJson(res, 200, { success: true, rooms });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/collaboration/rooms
  if (pathname === "/api/collaboration/rooms" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        taskCardId: string;
        hallId: string;
        title: string;
        description: string;
        participants: any[];
        createdByParticipantId: string;
      }>(req);

      const room = await createRoom(body);
      sendJson(res, 200, { success: true, room });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // GET /api/collaboration/rooms/:roomId
  const roomMatch = pathname.match(/^\/api\/collaboration\/rooms\/([^\/]+)$/);
  if (roomMatch && req.method === "GET") {
    try {
      const store = await loadRoomStore();
      const room = await getRoom(store, roomMatch[1]);
      if (!room) {
        sendJson(res, 404, { success: false, error: "Room not found" });
        return true;
      }
      const messages = store.messages.filter((m) => m.roomId === roomMatch[1]);
      sendJson(res, 200, { success: true, room, messages });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/collaboration/rooms/:roomId/messages
  const messageMatch = pathname.match(/^\/api\/collaboration\/rooms\/([^\/]+)\/messages$/);
  if (messageMatch && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        authorParticipantId: string;
        authorLabel: string;
        authorSemanticRole?: string;
        content: string;
        kind?: string;
      }>(req);

      const message = await appendRoomMessage({
        roomId: messageMatch[1],
        ...body,
      });
      sendJson(res, 200, { success: true, message });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // PATCH /api/collaboration/rooms/:roomId/stage
  const stageMatch = pathname.match(/^\/api\/collaboration\/rooms\/([^\/]+)\/stage$/);
  if (stageMatch && req.method === "PATCH") {
    try {
      const body = await parseJsonBody<{ stage: string }>(req);
      const room = await updateRoom(stageMatch[1], { stage: body.stage as any });
      sendJson(res, 200, { success: true, room });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/room/routes.ts

git commit -m "feat(room): add room REST API routes"
```

### Task 5.4: Room 前端组件

**Files:**
- Create: `src/modules/collaboration/components/RoomList.tsx`
- Create: `src/modules/collaboration/components/RoomWorkbench.tsx`

- [ ] **Step 1: 实现 RoomList 组件**

```tsx
// src/modules/collaboration/components/RoomList.tsx
import { useState, useEffect } from 'react';
import { useCollaborationStore } from '../store';
import { cn } from '@/lib/utils';
import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RoomListProps {
  selectedRoomId?: string;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom?: () => void;
}

export function RoomList({ selectedRoomId, onSelectRoom, onCreateRoom }: RoomListProps) {
  const { rooms, fetchRooms } = useCollaborationStore();

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-medium">任务房间</h3>
        {onCreateRoom && (
          <Button size="sm" variant="ghost" onClick={onCreateRoom}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rooms.map((room) => (
          <button
            key={room.roomId}
            className={cn(
              'w-full text-left p-3 border-b transition-colors hover:bg-accent/50',
              selectedRoomId === room.roomId && 'bg-primary/5 border-l-2 border-l-primary'
            )}
            onClick={() => onSelectRoom(room.roomId)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{room.title}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {room.currentOwnerLabel || '未指派'} · {room.stage}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/collaboration/components/RoomList.tsx

git commit -m "feat(room): add RoomList component"
```

---

## Chunk 6: 意图分类系统

**目标：** 实现用户消息意图分类，根据语义自动调整调度策略。

**预估时间：** 3-5 天

### Task 6.1: 意图分类器实现

**Files:**
- Create: `electron/modules/collaboration/intent-classifier.ts`
- Create: `electron/modules/collaboration/__tests__/intent-classifier.test.ts`

- [ ] **Step 1: 实现意图分类器**

```typescript
// electron/modules/collaboration/intent-classifier.ts
export type HallOperatorIntentType =
  | "greeting"
  | "light_chat"
  | "discussion_request"
  | "task_request"
  | "direct_deliverable_request"
  | "review_request"
  | "planning_request"
  | "control_request";

export interface ClassifiedIntent {
  type: HallOperatorIntentType;
  confidence: number; // 0-1
  explicitTarget?: string;
  requiresImmediateExecution?: boolean;
}

const INTENT_KEYWORDS: Record<HallOperatorIntentType, string[]> = {
  greeting: ["hi", "hello", "hey", "你好", "在吗", "早上好", "晚上好"],
  light_chat: ["how are you", "怎么样", "最近如何", "闲聊", "聊天"],
  discussion_request: ["讨论", "商量", " brainstorm", "头脑风暴", "怎么看", "意见", "想法"],
  task_request: ["任务", "todo", "安排", "分配", "新建", "创建"],
  direct_deliverable_request: ["直接做", "马上做", "立即执行", "出代码", "写", "实现", "deploy", "发布"],
  review_request: ["review", "审核", "检查", "code review", "评审", "看一下", "评估"],
  planning_request: ["plan", "计划", "规划", "设计", "架构", "方案"],
  control_request: ["停止", "stop", "暂停", "继续", "resume", "跳过", "skip"],
};

export function classifyHallDiscussionFollowupIntent(
  message: string,
  currentStage: string = "discussion",
): ClassifiedIntent {
  const normalized = message.toLowerCase().trim();

  // Check each intent type
  const scores: Record<string, number> = {};

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    scores[intent] = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        scores[intent] += 1;
      }
    }
  }

  // Find highest scoring intent
  let bestIntent: HallOperatorIntentType = "discussion_request";
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as HallOperatorIntentType;
    }
  }

  // Calculate confidence
  const totalKeywords = Object.values(INTENT_KEYWORDS).flat().length;
  const confidence = Math.min(1, bestScore / 3);

  // Determine if requires immediate execution
  const requiresImmediateExecution =
    bestIntent === "direct_deliverable_request" ||
    (bestIntent === "control_request" && /停止|stop|暂停/.test(normalized));

  return {
    type: bestIntent,
    confidence,
    requiresImmediateExecution,
  };
}

// Helper to convert intent to dispatch mode
export function intentToDispatchMode(intent: ClassifiedIntent): "discussion" | "execution" | "handoff" | "review" {
  switch (intent.type) {
    case "direct_deliverable_request":
    case "task_request":
      return "execution";
    case "review_request":
      return "review";
    case "planning_request":
      return "discussion";
    default:
      return "discussion";
  }
}
```

- [ ] **Step 2: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { classifyHallDiscussionFollowupIntent, intentToDispatchMode } from '../intent-classifier';

describe('Intent Classifier', () => {
  it('should classify discussion request', () => {
    const result = classifyHallDiscussionFollowupIntent('大家讨论一下这个方案');
    expect(result.type).toBe('discussion_request');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should classify direct deliverable request', () => {
    const result = classifyHallDiscussionFollowupIntent('直接出代码吧');
    expect(result.type).toBe('direct_deliverable_request');
    expect(result.requiresImmediateExecution).toBe(true);
  });

  it('should classify review request', () => {
    const result = classifyHallDiscussionFollowupIntent('请 review 一下这段代码');
    expect(result.type).toBe('review_request');
  });

  it('should convert intent to dispatch mode', () => {
    expect(intentToDispatchMode({ type: 'direct_deliverable_request', confidence: 0.8 })).toBe('execution');
    expect(intentToDispatchMode({ type: 'review_request', confidence: 0.8 })).toBe('review');
    expect(intentToDispatchMode({ type: 'discussion_request', confidence: 0.8 })).toBe('discussion');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/modules/collaboration/intent-classifier.ts electron/modules/collaboration/__tests__/intent-classifier.test.ts

git commit -m "feat(intent): add intent classification system with keyword matching"
```

### Task 6.2: 集成意图分类到 Runtime Dispatch

**Files:**
- Modify: `electron/modules/collaboration/runtime-dispatch.ts`

- [ ] **Step 1: 修改 runtimeDispatch 使用意图分类**

```typescript
// 在 runtime-dispatch.ts 中
import { classifyHallDiscussionFollowupIntent, intentToDispatchMode } from './intent-classifier';

// 在 runtimeDispatch 函数中：
export async function runtimeDispatch(input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const { ctx, mode, participant, taskCard, hall, triggerMessage, operatorIntent } = input;

  // Classify intent from trigger message if no explicit operatorIntent
  let effectiveMode = mode;
  let classifiedIntent;

  if (triggerMessage && !operatorIntent) {
    classifiedIntent = classifyHallDiscussionFollowupIntent(
      triggerMessage.content,
      taskCard.stage,
    );
    effectiveMode = intentToDispatchMode(classifiedIntent);
    console.log(
      "[runtime-dispatch] Classified intent=%s mode=%s confidence=%s",
      classifiedIntent.type,
      effectiveMode,
      classifiedIntent.confidence,
    );
  }

  // Use effectiveMode for prompt building
  const prompt = buildDispatchPrompt({
    mode: effectiveMode,
    participant,
    taskCard,
    hall,
    triggerMessage,
    operatorIntent,
    // ... other params
  });

  // ... rest of dispatch logic
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/runtime-dispatch.ts

git commit -m "feat(intent): integrate intent classification into runtime dispatch"
```

---

## Chunk 7: 看门狗/自愈/监控系统

**目标：** 实现任务健康监控、死锁检测、自动恢复。

**预估时间：** 5-7 天

### Task 7.1: 看门狗核心

**Files:**
- Create: `electron/modules/collaboration/watchdog.ts`
- Create: `electron/modules/collaboration/auto-heal.ts`
- Create: `electron/modules/collaboration/__tests__/watchdog.test.ts`

- [ ] **Step 1: 实现看门狗**

```typescript
// electron/modules/collaboration/watchdog.ts
import { loadTaskCardStore, getTaskCard, releaseExecutionLock } from "./store";
import type { HallTaskCard } from "./types";

export interface WatchdogCheck {
  taskCardId: string;
  healthy: boolean;
  issues: WatchdogIssue[];
}

export interface WatchdogIssue {
  type: 'stalled' | 'deadlock' | 'orphan_lock' | 'timeout';
  severity: 'warning' | 'critical';
  description: string;
  suggestion: string;
}

const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;    // 30 minutes

export async function runWatchdogChecks(): Promise<WatchdogCheck[]> {
  const store = await loadTaskCardStore();
  const checks: WatchdogCheck[] = [];

  for (const taskCard of store.taskCards) {
    const issues: WatchdogIssue[] = [];

    // Check for stalled tasks
    if (isTaskStalled(taskCard)) {
      issues.push({
        type: 'stalled',
        severity: 'warning',
        description: `Task "${taskCard.title}" has been in ${taskCard.stage} for over ${STALL_THRESHOLD_MS / 60000} minutes`,
        suggestion: 'Consider marking blocked or reassigning',
      });
    }

    // Check for orphaned locks
    if (taskCard.executionLock) {
      const lockAge = Date.now() - new Date(taskCard.executionLock.acquiredAt).getTime();
      if (lockAge > LOCK_TIMEOUT_MS) {
        issues.push({
          type: 'orphan_lock',
          severity: 'critical',
          description: `Execution lock held by ${taskCard.executionLock.participantLabel} for over ${LOCK_TIMEOUT_MS / 60000} minutes`,
          suggestion: 'Auto-release the lock',
        });
      }
    }

    checks.push({
      taskCardId: taskCard.taskCardId,
      healthy: issues.length === 0,
      issues,
    });
  }

  return checks;
}

function isTaskStalled(taskCard: HallTaskCard): boolean {
  if (taskCard.stage === 'completed' || taskCard.stage === 'blocked') return false;

  const lastUpdate = new Date(taskCard.updatedAt).getTime();
  const age = Date.now() - lastUpdate;

  return age > STALL_THRESHOLD_MS;
}

export async function autoHealIssues(checks: WatchdogCheck[]): Promise<string[]> {
  const actions: string[] = [];

  for (const check of checks) {
    if (check.healthy) continue;

    for (const issue of check.issues) {
      switch (issue.type) {
        case 'orphan_lock': {
          await releaseExecutionLock(check.taskCardId, 'watchdog_auto_release');
          actions.push(`Released orphaned lock for task ${check.taskCardId}`);
          break;
        }
        case 'stalled': {
          // Could auto-mark as blocked or notify operator
          actions.push(`Detected stalled task ${check.taskCardId}: ${issue.description}`);
          break;
        }
      }
    }
  }

  return actions;
}
```

- [ ] **Step 2: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { runWatchdogChecks, autoHealIssues } from '../watchdog';

describe('Watchdog', () => {
  it('should detect stalled tasks', async () => {
    const checks = await runWatchdogChecks();
    // This test depends on actual store state
    // In practice, you'd mock the store
    expect(Array.isArray(checks)).toBe(true);
  });

  it('should auto-heal orphaned locks', async () => {
    const mockChecks = [
      {
        taskCardId: 'task-1',
        healthy: false,
        issues: [{
          type: 'orphan_lock' as const,
          severity: 'critical' as const,
          description: 'Lock held too long',
          suggestion: 'Release it',
        }],
      },
    ];

    const actions = await autoHealIssues(mockChecks);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]).toContain('Released orphaned lock');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/modules/collaboration/watchdog.ts electron/modules/collaboration/auto-heal.ts electron/modules/collaboration/__tests__/watchdog.test.ts

git commit -m "feat(watchdog): add health monitoring and auto-heal system"
```

### Task 7.2: 集成看门狗到调度器

**Files:**
- Modify: `electron/modules/collaboration/orchestrator-scheduler.ts`

- [ ] **Step 1: 在调度器中添加看门狗检查**

```typescript
// electron/modules/collaboration/orchestrator-scheduler.ts
import { runWatchdogChecks, autoHealIssues } from './watchdog';

// 在调度器的主循环中：
async function schedulerTick() {
  // ... existing logic ...

  // Run watchdog checks every 2 ticks (every 60 seconds)
  if (tickCount % 2 === 0) {
    try {
      const checks = await runWatchdogChecks();
      const unhealthy = checks.filter((c) => !c.healthy);

      if (unhealthy.length > 0) {
        console.warn(
          "[orchestrator-scheduler] Watchdog found %d unhealthy tasks",
          unhealthy.length,
        );

        const actions = await autoHealIssues(unhealthy);
        for (const action of actions) {
          console.log("[orchestrator-scheduler] Auto-heal: %s", action);
        }
      }
    } catch (err) {
      console.error("[orchestrator-scheduler] Watchdog error:", err);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/orchestrator-scheduler.ts

git commit -m "feat(watchdog): integrate watchdog into orchestrator scheduler"
```

---

## Chunk 8: 操作审计系统

**目标：** 记录所有关键操作（指派/交接/审核/停止/归档）。

**预估时间：** 2-3 天

### Task 8.1: 审计存储

**Files:**
- Create: `electron/modules/collaboration/audit-store.ts`
- Create: `electron/modules/collaboration/__tests__/audit-store.test.ts`

- [ ] **Step 1: 实现审计存储**

```typescript
// electron/modules/collaboration/audit-store.ts
import { randomUUID } from "node:crypto";
import { JsonStore } from "../../_shared/json-store";
import { getModuleFilePath } from "../../_shared/runtime-path";

export interface AuditEntry {
  auditId: string;
  timestamp: string;
  action: 'assign' | 'handoff' | 'review' | 'stop' | 'archive' | 'delete' | 'dispatch' | 'create';
  taskCardId: string;
  participantId: string;
  participantLabel: string;
  details: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

interface AuditStoreSnapshot {
  entries: AuditEntry[];
  updatedAt: string;
}

let auditStore: JsonStore<AuditStoreSnapshot> | null = null;

function getAuditStore(): JsonStore<AuditStoreSnapshot> {
  if (!auditStore) {
    auditStore = new JsonStore<AuditStoreSnapshot>({
      filePath: getModuleFilePath("collaboration", "audit-log.json"),
      defaultValue: { entries: [], updatedAt: new Date(0).toISOString() },
      schemaVersion: 1,
    });
  }
  return auditStore;
}

export async function appendAuditEntry(entry: Omit<AuditEntry, 'auditId' | 'timestamp'>): Promise<AuditEntry> {
  const store = await getAuditStore().read();
  const fullEntry: AuditEntry = {
    ...entry,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  store.entries.push(fullEntry);
  store.updatedAt = fullEntry.timestamp;
  await getAuditStore().write(store);

  return fullEntry;
}

export async function getAuditLog(taskCardId?: string, limit = 100): Promise<AuditEntry[]> {
  const store = await getAuditStore().read();
  let entries = store.entries;

  if (taskCardId) {
    entries = entries.filter((e) => e.taskCardId === taskCardId);
  }

  return entries.slice(-limit).reverse();
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/audit-store.ts electron/modules/collaboration/__tests__/audit-store.test.ts

git commit -m "feat(audit): add operation audit log system"
```

### Task 8.2: 在路由中集成审计

**Files:**
- Modify: `electron/modules/collaboration/routes.ts`

- [ ] **Step 1: 在关键端点添加审计记录**

```typescript
// 在 routes.ts 中
import { appendAuditEntry } from './audit-store';

// 在 assign 端点中：
await appendAuditEntry({
  action: 'assign',
  taskCardId: taskCard.taskCardId,
  participantId: body.participantId,
  participantLabel: body.label || body.participantId,
  details: { note: body.note, dispatch: body.dispatch },
});

// 在 handoff 端点中：
await appendAuditEntry({
  action: 'handoff',
  taskCardId: taskCard.taskCardId,
  participantId: body.nextParticipantId,
  participantLabel: body.nextLabel || body.nextParticipantId,
  details: { note: body.note },
});

// 在 review 端点中：
await appendAuditEntry({
  action: 'review',
  taskCardId: taskCard.taskCardId,
  participantId: body.participantId,
  participantLabel: body.participantLabel || body.participantId,
  details: { outcome: body.outcome, note: body.note },
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/collaboration/routes.ts

git commit -m "feat(audit): integrate audit logging into route handlers"
```

---

## Chunk 9: UI/UX 体验优化

**目标：** 三栏布局、动效注入、响应式断点。

**预估时间：** 3-5 天

### Task 9.1: 三栏布局重构

**Files:**
- Modify: `src/modules/collaboration/CollaborationPage.tsx`
- Create: `src/modules/collaboration/components/TaskCardList.tsx`
- Create: `src/modules/collaboration/components/ContextPanel.tsx`

- [ ] **Step 1: 重构为左-中-右三栏**

```tsx
// src/modules/collaboration/CollaborationPage.tsx
// 修改布局为：
// 左栏 (w-72): TaskCardList
// 中栏 (flex-1): MessageStream
// 右栏 (w-80): ContextPanel (当选择任务时显示)

export function CollaborationPage() {
  // ... existing state ...

  return (
    <ModulePageLayout className="p-0">
      <div className="flex h-full">
        {/* Left: Task Card List */}
        <div className="w-72 border-r flex flex-col">
          <TaskCardList
            taskCards={taskCards}
            selectedId={selectedTaskCardId}
            onSelect={selectTaskCard}
          />
        </div>

        {/* Center: Message Stream */}
        <div className="flex-1 flex flex-col min-w-0">
          <MessageStream
            messages={messages}
            participants={participants}
            // ... other props
          />
        </div>

        {/* Right: Context Panel */}
        {selectedTaskCard && (
          <div className="w-80 border-l">
            <ContextPanel
              taskCard={selectedTaskCard}
              participants={participants}
            />
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/collaboration/CollaborationPage.tsx src/modules/collaboration/components/TaskCardList.tsx src/modules/collaboration/components/ContextPanel.tsx

git commit -m "feat(ui): refactor to three-column layout"
```

### Task 9.2: 动效注入

**Files:**
- Modify: `src/modules/collaboration/components/MessageStream.tsx`
- Modify: `src/modules/collaboration/components/StageFlow.tsx`

- [ ] **Step 1: 添加消息到达动效**

```tsx
// 在 MessageStream.tsx 中，为每条消息添加进入动画
import { motion } from 'framer-motion';

// 在消息渲染中：
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {/* message content */}
</motion.div>
```

- [ ] **Step 2: 添加阶段切换动效**

```tsx
// 在 StageFlow.tsx 中
<motion.div
  layout
  className={cn(
    'h-2 w-2 rounded-full transition-colors',
    isActive && 'bg-primary',
    isCompleted && 'bg-emerald-500',
  )}
  animate={isActive ? { scale: [1, 1.3, 1] } : {}}
  transition={{ repeat: Infinity, duration: 2 }}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collaboration/components/MessageStream.tsx src/modules/collaboration/components/StageFlow.tsx

git commit -m "feat(ui): add motion animations for messages and stage transitions"
```

---

## 十、里程碑与验收标准

### Milestone 1: 测试基础设施（Week 1）

- [ ] Vitest 环境搭建完成
- [ ] Store 层测试覆盖率 > 80%
- [ ] Speaker Policy 测试覆盖率 100%
- [ ] Content Sanitizer 测试覆盖率 > 80%
- [ ] Mention Router 测试覆盖率 100%
- [ ] Role Resolver 测试覆盖率 100%
- [ ] Handoff Validator 测试覆盖率 100%
- [ ] Budget Governance 测试覆盖率 > 80%

**验收：** `pnpm test:coverage` 显示 collaboration 模块整体覆盖率 > 40%

### Milestone 2: SSE 优化（Week 2）

- [ ] `draft_start` 事件实现
- [ ] 动态轮询间隔（500ms/2s/3s）
- [ ] 前端 draft 生命周期管理完善
- [ ] SSE 端到端测试

**验收：** 发送 @提及 后，Agent 回复在 1 秒内开始显示，无 "正在思考…" 长时间占位

### Milestone 3: 任务房间 MVP（Week 3-4）

- [ ] Room 类型定义
- [ ] Room Store CRUD + 持久化
- [ ] Room REST API（list/create/get/messages/stage）
- [ ] Room 前端组件（RoomList/RoomWorkbench）
- [ ] Room 与 Hall 的事件桥接

**验收：** 可从任务卡创建房间，在房间内发送消息，切换房间阶段

### Milestone 4: 意图分类 + 看门狗（Week 5-6）

- [ ] 意图分类器实现
- [ ] 集成到 runtime dispatch
- [ ] 看门狗健康检查
- [ ] 自动恢复（orphan_lock 释放）
- [ ] 审计日志系统

**验收：**
- 发送"直接出代码"自动进入 execution 模式
- 30 分钟未释放的锁自动释放
- 所有关键操作有审计记录

### Milestone 5: UI 优化（Week 7-8）

- [ ] 三栏布局重构
- [ ] 消息进入动效
- [ ] 阶段切换动效
- [ ] 响应式断点（768px/1024px/1440px）

**验收：** 在 1280px 以上屏幕显示三栏，768px-1279px 显示两栏，768px 以下显示单栏 + 抽屉

---

## 十一、风险与回滚策略

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| JsonStore 并发写入冲突 | 低 | 高 | 使用文件锁或改为 SQLite |
| Room 子系统引入数据不一致 | 中 | 高 | 每阶段完成后完整集成测试 |
| SSE 动态轮询增加 Gateway 负载 | 中 | 中 | 监控 Gateway 响应时间，必要时回退到 3s 间隔 |
| 意图分类误判 | 中 | 低 | 保留手动覆盖机制，分类结果仅影响默认行为 |
| 看门狗误释放锁 | 低 | 高 | 仅对超过 30 分钟的锁自动释放，其他仅告警 |

**回滚策略：**
- 每个 Chunk 完成后创建 Git tag（`collab-m1`, `collab-m2` 等）
- 出问题可回滚到上一个 tag
- 新功能通过配置开关控制（如 `ROOM_SYSTEM_ENABLED=true/false`）

---

*计划完毕。Ready to execute?*
