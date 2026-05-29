# 模型管理功能增强实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ClawX Models 页面新增全局默认模型配置和 Agent 级模型分配集中管理功能。

**Architecture:** 复用现有 `openclaw.json` 配置体系，新增后端 API 写入 `agents.defaults.model` 和批量修改 `agents.list[].model`，前端新增共享模型选择弹窗和二级管理视图。

**Tech Stack:** React + TypeScript + Zustand + Electron Express API + vitest

---

## 文件结构映射

### 后端
| 文件 | 职责 |
|---|---|
| `electron/utils/agent-config.ts` | Agent 配置读写，新增 `updateDefaultModel`、`batchUpdateAgentModels` |
| `electron/api/routes/agents.ts` | REST 路由，新增 `PUT /api/agents/default-model`、`PUT /api/agents/batch-model` |

### 前端
| 文件 | 职责 |
|---|---|
| `src/stores/agents.ts` | Zustand store，新增 `updateDefaultModel`、`batchUpdateAgentModels` actions |
| `src/components/models/ModelSelectorModal.tsx` | **新建** — 共享模型选择弹窗（抽取自 `AgentModelModal`） |
| `src/components/models/AgentModelAssignmentsView.tsx` | **新建** — Agent 模型分配二级页面 |
| `src/components/models/GlobalDefaultModelCard.tsx` | **新建** — 全局默认模型配置卡片 |
| `src/pages/Models/index.tsx` | 集成新组件 |
| `src/pages/Agents/index.tsx` | 将内联 `AgentModelModal` 替换为复用 `ModelSelectorModal` |

### i18n
| 文件 | 职责 |
|---|---|
| `src/i18n/locales/zh/agents.json` | 新增中文翻译键 |
| `src/i18n/locales/en/agents.json` | 新增英文翻译键 |
| `src/i18n/locales/ja/agents.json` | 新增日文翻译键（复制英文，标注 TODO） |
| `src/i18n/locales/ru/agents.json` | 新增俄文翻译键（复制英文，标注 TODO） |

### 测试
| 文件 | 职责 |
|---|---|
| `tests/unit/agent-config.test.ts` | 新增 `updateDefaultModel`、`batchUpdateAgentModels` 测试 |
| `tests/unit/agents-routes.test.ts` | 新增路由测试 |

---

## Chunk 1: 后端 API 与配置函数

**目标：** 实现后端 `updateDefaultModel` 和 `batchUpdateAgentModels`，并暴露 REST 路由。

### Task 1.1: 新增 `updateDefaultModel` 函数

**Files:**
- Modify: `electron/utils/agent-config.ts`（在 `updateAgentModel` 之后插入）
- Test: `tests/unit/agent-config.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/unit/agent-config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateDefaultModel, batchUpdateAgentModels } from '../../electron/utils/agent-config';

// Mock fs/promises and path utilities as needed by existing tests

describe('updateDefaultModel', () => {
  it('should set agents.defaults.model.primary to the given modelRef', async () => {
    // Setup: mock readOpenClawConfig to return a config without defaults.model
    // Execute: await updateDefaultModel('anthropic/claude-sonnet-4-6')
    // Assert: writeOpenClawConfig called with agents.defaults.model.primary === 'anthropic/claude-sonnet-4-6'
  });

  it('should clear agents.defaults.model when modelRef is null', async () => {
    // Setup: mock config with existing agents.defaults.model
    // Execute: await updateDefaultModel(null)
    // Assert: agents.defaults.model is deleted or set to undefined
  });

  it('should reject invalid modelRef format', async () => {
    // Execute: await updateDefaultModel('invalid-no-slash')
    // Assert: throws Error with message containing 'provider/model'
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/agent-config.test.ts -t "updateDefaultModel"`
Expected: FAIL — `updateDefaultModel is not defined`

- [ ] **Step 3: 实现 `updateDefaultModel`**

在 `electron/utils/agent-config.ts` 中 `updateAgentModel` 函数之后添加：

```typescript
export async function updateDefaultModel(modelRef: string | null): Promise<AgentsSnapshot> {
  return withConfigLock(async () => {
    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries } = normalizeAgentsConfig(config);

    if (!config.agents) {
      config.agents = {};
    }
    if (!config.agents.defaults) {
      config.agents.defaults = {};
    }

    const normalizedModelRef = typeof modelRef === 'string' ? modelRef.trim() : '';

    if (!normalizedModelRef) {
      delete config.agents.defaults.model;
    } else {
      if (!isValidModelRef(normalizedModelRef)) {
        throw new Error('modelRef must be in "provider/model" format');
      }
      config.agents.defaults.model = { primary: normalizedModelRef };
    }

    await writeOpenClawConfig(config);
    logger.info('Updated default model', { modelRef: normalizedModelRef || null });
    return buildSnapshotFromConfig(config);
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/agent-config.test.ts -t "updateDefaultModel"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/utils/agent-config.ts tests/unit/agent-config.test.ts
git commit -m "feat(agent-config): add updateDefaultModel function"
```

### Task 1.2: 新增 `batchUpdateAgentModels` 函数

**Files:**
- Modify: `electron/utils/agent-config.ts`
- Test: `tests/unit/agent-config.test.ts`

- [ ] **Step 1: 写测试**

```typescript
describe('batchUpdateAgentModels', () => {
  it('should set model.primary for all agents', async () => {
    // Setup: mock config with 3 agents, none with model overrides
    // Execute: await batchUpdateAgentModels('openai/gpt-4o')
    // Assert: all 3 agents have model.primary === 'openai/gpt-4o'
  });

  it('should clear model overrides for all agents when modelRef is null', async () => {
    // Setup: mock config with 2 agents having model overrides
    // Execute: await batchUpdateAgentModels(null)
    // Assert: no agents have model field
  });

  it('should reject invalid modelRef format', async () => {
    // Execute: await batchUpdateAgentModels('bad-format')
    // Assert: throws Error
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/agent-config.test.ts -t "batchUpdateAgentModels"`
Expected: FAIL

- [ ] **Step 3: 实现 `batchUpdateAgentModels`**

在 `updateDefaultModel` 之后添加：

```typescript
export async function batchUpdateAgentModels(modelRef: string | null): Promise<AgentsSnapshot> {
  return withConfigLock(async () => {
    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries } = normalizeAgentsConfig(config);

    const normalizedModelRef = typeof modelRef === 'string' ? modelRef.trim() : '';

    if (normalizedModelRef && !isValidModelRef(normalizedModelRef)) {
      throw new Error('modelRef must be in "provider/model" format');
    }

    const nextEntries = entries.map((entry) => {
      if (!normalizedModelRef) {
        const { model: _omit, ...rest } = entry;
        return rest as AgentListEntry;
      }
      return {
        ...entry,
        model: { primary: normalizedModelRef },
      };
    });

    config.agents = {
      ...agentsConfig,
      list: nextEntries,
    };

    await writeOpenClawConfig(config);
    logger.info('Batch updated agent models', { modelRef: normalizedModelRef || null, count: nextEntries.length });
    return buildSnapshotFromConfig(config);
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/agent-config.test.ts -t "batchUpdateAgentModels"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/utils/agent-config.ts tests/unit/agent-config.test.ts
git commit -m "feat(agent-config): add batchUpdateAgentModels function"
```

### Task 1.3: 新增 REST 路由

**Files:**
- Modify: `electron/api/routes/agents.ts`
- Test: `tests/unit/agents-routes.test.ts`

- [ ] **Step 1: 写路由测试**

```typescript
// tests/unit/agents-routes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleAgentRoutes } from '../../electron/api/routes/agents';

describe('PUT /api/agents/default-model', () => {
  it('should update default model and return snapshot', async () => {
    // Mock request/response/context
    // Assert: 200 with success:true and snapshot
  });

  it('should reject invalid modelRef', async () => {
    // Assert: 400 or 500 with error message
  });
});

describe('PUT /api/agents/batch-model', () => {
  it('should batch update agent models', async () => {
    // Assert: 200 with success:true
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/agents-routes.test.ts -t "default-model\|batch-model"`
Expected: FAIL

- [ ] **Step 3: 实现路由**

在 `electron/api/routes/agents.ts` 的 `handleAgentRoutes` 函数中，在现有的 `PUT /api/agents/:id/model` 处理之后，添加两个新路由块：

```typescript
// PUT /api/agents/default-model
if (url.pathname === '/api/agents/default-model' && req.method === 'PUT') {
  try {
    const body = await parseJsonBody<{ modelRef?: string | null }>(req);
    const snapshot = await updateDefaultModel(body.modelRef ?? null);
    try {
      await syncAllProviderAuthToRuntime();
    } catch (syncError) {
      console.warn('[agents] Failed to sync runtime after updating default model:', syncError);
    }
    scheduleGatewayReload(ctx, 'update-default-model');
    sendJson(res, 200, { success: true, ...snapshot });
  } catch (error) {
    sendJson(res, 500, { success: false, error: String(error) });
  }
  return true;
}

// PUT /api/agents/batch-model
if (url.pathname === '/api/agents/batch-model' && req.method === 'PUT') {
  try {
    const body = await parseJsonBody<{ modelRef?: string | null }>(req);
    const snapshot = await batchUpdateAgentModels(body.modelRef ?? null);
    try {
      await syncAllProviderAuthToRuntime();
      for (const agent of snapshot.agents) {
        await syncAgentModelOverrideToRuntime(agent.id).catch(() => {});
      }
    } catch (syncError) {
      console.warn('[agents] Failed to sync runtime after batch update:', syncError);
    }
    scheduleGatewayReload(ctx, 'batch-update-agent-models');
    sendJson(res, 200, { success: true, ...snapshot });
  } catch (error) {
    sendJson(res, 500, { success: false, error: String(error) });
  }
  return true;
}
```

**注意**：需要在文件顶部 import `updateDefaultModel` 和 `batchUpdateAgentModels`：

```typescript
import {
  assignChannelToAgent,
  clearChannelBinding,
  createAgent,
  deleteAgentConfig,
  listAgentsSnapshot,
  removeAgentWorkspaceDirectory,
  resolveAccountIdForAgent,
  updateAgentModel,
  updateAgentName,
  updateDefaultModel,
  batchUpdateAgentModels,
} from '../../utils/agent-config';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/agents-routes.test.ts -t "default-model\|batch-model"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/api/routes/agents.ts tests/unit/agents-routes.test.ts
git commit -m "feat(agents-routes): add PUT /api/agents/default-model and /api/agents/batch-model"
```

---

## Chunk 2: 前端 Store 与共享组件

**目标：** 实现 Zustand store 新增 actions，并抽取共享 `ModelSelectorModal`。

### Task 2.1: 新增 Store Actions

**Files:**
- Modify: `src/stores/agents.ts`

- [ ] **Step 1: 实现 actions**

在 `src/stores/agents.ts` 中 `updateAgentModel` 之后添加：

```typescript
  updateDefaultModel: async (modelRef: string | null) => {
    set({ error: null });
    try {
      const snapshot = await hostApiFetch<AgentsSnapshot & { success?: boolean }>(
        '/api/agents/default-model',
        {
          method: 'PUT',
          body: JSON.stringify({ modelRef }),
        }
      );
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  batchUpdateAgentModels: async (modelRef: string | null) => {
    set({ error: null });
    try {
      const snapshot = await hostApiFetch<AgentsSnapshot & { success?: boolean }>(
        '/api/agents/batch-model',
        {
          method: 'PUT',
          body: JSON.stringify({ modelRef }),
        }
      );
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },
```

同时更新 interface：

```typescript
interface AgentsState {
  // ... existing fields
  updateDefaultModel: (modelRef: string | null) => Promise<void>;
  batchUpdateAgentModels: (modelRef: string | null) => Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/agents.ts
git commit -m "feat(agents-store): add updateDefaultModel and batchUpdateAgentModels actions"
```

### Task 2.2: 抽取 `ModelSelectorModal` 共享组件

**Files:**
- Create: `src/components/models/ModelSelectorModal.tsx`
- Modify: `src/pages/Agents/index.tsx`（替换内联 `AgentModelModal`）

**设计思路**：将 `AgentModelModal` 的选择逻辑（Provider 下拉 + Model ID 输入 + 预览 + 保存）抽取为通用组件。保留 `AgentModelModal` 作为包装器以保持向后兼容，但内部使用 `ModelSelectorModal`。

- [ ] **Step 1: 创建 `ModelSelectorModal.tsx`**

```tsx
// src/components/models/ModelSelectorModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useProviderStore } from '@/stores/providers';
import {
  buildRuntimeProviderOptions,
  splitModelRef,
  type RuntimeProviderOption,
} from '@/lib/model-options';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ModelSelectorModalProps {
  title: string;
  description?: string;
  defaultModelRef?: string | null;
  currentModelRef?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  useDefaultLabel?: string;
  onSave: (modelRef: string | null) => Promise<void>;
  onClose: () => void;
}

const inputClasses = 'h-[44px] rounded-xl font-mono text-sm bg-surface-input border focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground placeholder:text-foreground/40';
const selectClasses = 'h-[44px] w-full rounded-xl font-mono text-sm bg-surface-input border border focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground px-3';

export function ModelSelectorModal({
  title,
  description,
  defaultModelRef,
  currentModelRef,
  submitLabel,
  cancelLabel,
  useDefaultLabel,
  onSave,
  onClose,
}: ModelSelectorModalProps) {
  const { t } = useTranslation('agents');
  const providerAccounts = useProviderStore((state) => state.accounts);
  const providerStatuses = useProviderStore((state) => state.statuses);
  const providerVendors = useProviderStore((state) => state.vendors);
  const providerDefaultAccountId = useProviderStore((state) => state.defaultAccountId);

  const [selectedRuntimeProviderKey, setSelectedRuntimeProviderKey] = useState('');
  const [modelIdInput, setModelIdInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const runtimeProviderOptions = useMemo<RuntimeProviderOption[]>(
    () => buildRuntimeProviderOptions(
      providerAccounts,
      providerStatuses,
      providerVendors,
      providerDefaultAccountId,
    ),
    [providerAccounts, providerDefaultAccountId, providerStatuses, providerVendors],
  );

  useEffect(() => {
    const effective = splitModelRef(currentModelRef || defaultModelRef);
    if (effective) {
      setSelectedRuntimeProviderKey(effective.providerKey);
      setModelIdInput(effective.modelId);
      return;
    }
    setSelectedRuntimeProviderKey(runtimeProviderOptions[0]?.runtimeProviderKey || '');
    setModelIdInput('');
  }, [currentModelRef, defaultModelRef, runtimeProviderOptions]);

  const selectedProvider = runtimeProviderOptions.find(
    (option) => option.runtimeProviderKey === selectedRuntimeProviderKey,
  ) || null;
  const trimmedModelId = modelIdInput.trim();
  const nextModelRef = selectedRuntimeProviderKey && trimmedModelId
    ? `${selectedRuntimeProviderKey}/${trimmedModelId}`
    : '';

  const normalizedDefaultModelRef = (defaultModelRef || '').trim();
  const isUsingDefaultModelInForm = Boolean(normalizedDefaultModelRef) && nextModelRef === normalizedDefaultModelRef;
  const currentRefTrimmed = (currentModelRef || '').trim();
  const desiredModelRef = nextModelRef && nextModelRef !== normalizedDefaultModelRef
    ? nextModelRef
    : null;
  const modelChanged = (desiredModelRef || '') !== currentRefTrimmed;

  const handleRequestClose = () => {
    if (saving || modelChanged) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!selectedRuntimeProviderKey) return;
    if (!trimmedModelId) return;
    if (!modelChanged) return;
    if (!nextModelRef.includes('/')) return;

    setSaving(true);
    try {
      await onSave(desiredModelRef);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleUseDefaultModel = () => {
    const parsedDefault = splitModelRef(normalizedDefaultModelRef);
    if (!parsedDefault) {
      setSelectedRuntimeProviderKey('');
      setModelIdInput('');
      return;
    }
    setSelectedRuntimeProviderKey(parsedDefault.providerKey);
    setModelIdInput(parsedDefault.modelId);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl rounded-xl border shadow-lg bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-xl font-bold">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm mt-1 text-foreground/70">
                {description}
              </CardDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRequestClose}
            className="rounded-lg h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-4">
          <div className="space-y-2">
            <Label className="text-xs text-foreground/70">{t('settingsDialog.modelProviderLabel')}</Label>
            <select
              value={selectedRuntimeProviderKey}
              onChange={(event) => {
                const nextProvider = event.target.value;
                setSelectedRuntimeProviderKey(nextProvider);
                if (!modelIdInput.trim()) {
                  const option = runtimeProviderOptions.find(
                    (candidate) => candidate.runtimeProviderKey === nextProvider,
                  );
                  setModelIdInput(option?.configuredModelId || '');
                }
              }}
              className={selectClasses}
            >
              <option value="">{t('settingsDialog.modelProviderPlaceholder')}</option>
              {runtimeProviderOptions.map((option) => (
                <option key={option.runtimeProviderKey} value={option.runtimeProviderKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-foreground/70">{t('settingsDialog.modelIdLabel')}</Label>
            <Input
              value={modelIdInput}
              onChange={(event) => setModelIdInput(event.target.value)}
              placeholder={selectedProvider?.modelIdPlaceholder || selectedProvider?.configuredModelId || t('settingsDialog.modelIdPlaceholder')}
              className={inputClasses}
            />
          </div>
          {!!nextModelRef && (
            <p className="text-xs font-mono text-foreground/70 break-all">
              {t('settingsDialog.modelPreview')}: {nextModelRef}
            </p>
          )}
          {runtimeProviderOptions.length === 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t('settingsDialog.modelProviderEmpty')}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleUseDefaultModel}
              disabled={saving || !normalizedDefaultModelRef || isUsingDefaultModelInForm}
            >
              {useDefaultLabel || t('settingsDialog.useDefaultModel')}
            </Button>
            <Button variant="outline" onClick={handleRequestClose}>
              {cancelLabel || t('common:actions.cancel')}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !selectedRuntimeProviderKey || !trimmedModelId || !modelChanged}
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : (submitLabel || t('common:actions.save'))}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: 修改 `AgentModelModal` 复用 `ModelSelectorModal`**

在 `src/pages/Agents/index.tsx` 中，将 `AgentModelModal` 组件体替换为：

```tsx
function AgentModelModal({
  agent,
  onClose,
}: {
  agent: AgentSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation('agents');
  const { updateAgentModel, defaultModelRef } = useAgentsStore();

  return (
    <ModelSelectorModal
      title={t('settingsDialog.modelLabel')}
      description={t('settingsDialog.modelOverrideDescription', { defaultModel: defaultModelRef || '-' })}
      defaultModelRef={defaultModelRef}
      currentModelRef={agent.overrideModelRef}
      onSave={async (modelRef) => {
        await updateAgentModel(agent.id, modelRef);
      }}
      onClose={onClose}
    />
  );
}
```

同时确保 `ModelSelectorModal` 被 import。

- [ ] **Step 3: Commit**

```bash
git add src/components/models/ModelSelectorModal.tsx src/pages/Agents/index.tsx
git commit -m "feat(models): extract shared ModelSelectorModal component"
```

---

## Chunk 3: Models 页面集成

**目标：** 在 Models 页面新增全局默认模型卡片和 Agent 模型分配入口。

### Task 3.1: 创建 `GlobalDefaultModelCard`

**Files:**
- Create: `src/components/models/GlobalDefaultModelCard.tsx`

- [ ] **Step 1: 实现组件**

```tsx
// src/components/models/GlobalDefaultModelCard.tsx
import { useState } from 'react';
import { Settings2, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgentsStore } from '@/stores/agents';
import { ModelSelectorModal } from './ModelSelectorModal';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function GlobalDefaultModelCard() {
  const { t } = useTranslation('agents');
  const { defaultModelRef, updateDefaultModel } = useAgentsStore();
  const [showModal, setShowModal] = useState(false);

  const handleSave = async (modelRef: string | null) => {
    await updateDefaultModel(modelRef);
    toast.success(modelRef ? t('toast.defaultModelUpdated') : t('toast.defaultModelCleared'));
  };

  return (
    <>
      <Card className="rounded-xl border shadow-sm bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {t('globalDefaultModel.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('globalDefaultModel.currentLabel')}</p>
              <p className="font-mono text-sm text-foreground break-all">
                {defaultModelRef || t('globalDefaultModel.notSet')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              {t('globalDefaultModel.configure')}
            </Button>
          </div>
        </CardContent>
      </Card>
      {showModal && (
        <ModelSelectorModal
          title={t('globalDefaultModel.configureTitle')}
          description={t('globalDefaultModel.configureDescription')}
          currentModelRef={defaultModelRef}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/models/GlobalDefaultModelCard.tsx
git commit -m "feat(models): add GlobalDefaultModelCard component"
```

### Task 3.2: 创建 `AgentModelAssignmentsView`

**Files:**
- Create: `src/components/models/AgentModelAssignmentsView.tsx`

- [ ] **Step 1: 实现组件**

参考 `BindingManageView` 的模式，实现一个二级页面组件。

```tsx
// src/components/models/AgentModelAssignmentsView.tsx
import { useState, useMemo } from 'react';
import { ArrowLeft, Pencil, RotateCcw, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAgentsStore } from '@/stores/agents';
import { ModelSelectorModal } from './ModelSelectorModal';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AgentSummary } from '@/types/agent';

interface AgentModelAssignmentsViewProps {
  onBack: () => void;
}

export function AgentModelAssignmentsView({ onBack }: AgentModelAssignmentsViewProps) {
  const { t } = useTranslation('agents');
  const { agents, defaultModelRef, updateAgentModel, batchUpdateAgentModels } = useAgentsStore();
  const [editAgent, setEditAgent] = useState<AgentSummary | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const inheritedCount = useMemo(
    () => agents.filter((a) => a.inheritedModel).length,
    [agents],
  );
  const overriddenCount = agents.length - inheritedCount;

  const handleResetAgent = async (agentId: string) => {
    try {
      await updateAgentModel(agentId, null);
      toast.success(t('toast.agentModelReset'));
    } catch (error) {
      toast.error(t('toast.agentModelUpdateFailed', { error: String(error) }));
    }
  };

  const handleBatchSave = async (modelRef: string | null) => {
    try {
      await batchUpdateAgentModels(modelRef);
      toast.success(t('toast.batchModelUpdated'));
      setShowBatchModal(false);
    } catch (error) {
      toast.error(t('toast.batchModelUpdateFailed', { error: String(error) }));
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('agentModelAssignments.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('agentModelAssignments.subtitle')}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowBatchModal(true)}>
          <Zap className="h-4 w-4 mr-2" />
          {t('agentModelAssignments.batchSet')}
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{t('agentModelAssignments.inheritedCount', { count: inheritedCount })}</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span>{t('agentModelAssignments.overriddenCount', { count: overriddenCount })}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="rounded-xl border shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {agent.modelRef || defaultModelRef || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={agent.inheritedModel ? 'secondary' : 'default'} className="text-xs">
                  {agent.inheritedModel
                    ? t('agentModelAssignments.inherited')
                    : t('agentModelAssignments.overridden')}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditAgent(agent)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!agent.inheritedModel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleResetAgent(agent.id)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editAgent && (
        <ModelSelectorModal
          title={t('agentModelAssignments.editTitle', { name: editAgent.name })}
          description={t('agentModelAssignments.editDescription', { defaultModel: defaultModelRef || '-' })}
          defaultModelRef={defaultModelRef}
          currentModelRef={editAgent.overrideModelRef}
          onSave={async (modelRef) => {
            await updateAgentModel(editAgent.id, modelRef);
            toast.success(modelRef ? t('toast.agentModelUpdated') : t('toast.agentModelReset'));
            setEditAgent(null);
          }}
          onClose={() => setEditAgent(null)}
        />
      )}

      {showBatchModal && (
        <ModelSelectorModal
          title={t('agentModelAssignments.batchTitle')}
          description={t('agentModelAssignments.batchDescription')}
          defaultModelRef={defaultModelRef}
          onSave={handleBatchSave}
          onClose={() => setShowBatchModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/models/AgentModelAssignmentsView.tsx
git commit -m "feat(models): add AgentModelAssignmentsView component"
```

### Task 3.3: 集成到 Models 页面

**Files:**
- Modify: `src/pages/Models/index.tsx`

- [ ] **Step 1: 修改页面**

在 `src/pages/Models/index.tsx` 中：
1. 新增 import：`GlobalDefaultModelCard`、`AgentModelAssignmentsView`
2. 新增状态：`const [showAssignmentsView, setShowAssignmentsView] = useState(false);`
3. 条件渲染：如果 `showAssignmentsView` 为 true，渲染 `AgentModelAssignmentsView`
4. 否则在 `ProvidersSettings` 下方添加 `GlobalDefaultModelCard` 和入口按钮

```tsx
// 新增 imports
import { GlobalDefaultModelCard } from '@/components/models/GlobalDefaultModelCard';
import { AgentModelAssignmentsView } from '@/components/models/AgentModelAssignmentsView';
import { Users } from 'lucide-react';

// 在组件内部添加状态
const [showAssignmentsView, setShowAssignmentsView] = useState(false);

// 条件渲染
if (showAssignmentsView) {
  return (
    <AgentModelAssignmentsView onBack={() => setShowAssignmentsView(false)} />
  );
}

// 在 ProvidersSettings 下方添加
<div className="space-y-6">
  <GlobalDefaultModelCard />
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold">{t('dashboard:models.agentAssignments')}</h2>
    <Button variant="outline" size="sm" onClick={() => setShowAssignmentsView(true)}>
      <Users className="h-4 w-4 mr-2" />
      {t('dashboard:models.manageAssignments')}
    </Button>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Models/index.tsx
git commit -m "feat(models): integrate GlobalDefaultModelCard and AgentModelAssignmentsView"
```

---

## Chunk 4: i18n 与测试收尾

### Task 4.1: 添加 i18n 翻译键

**Files:**
- Modify: `src/i18n/locales/zh/agents.json`
- Modify: `src/i18n/locales/en/agents.json`
- Modify: `src/i18n/locales/ja/agents.json`
- Modify: `src/i18n/locales/ru/agents.json`

- [ ] **Step 1: 中文翻译**

在 `src/i18n/locales/zh/agents.json` 的顶层添加：

```json
{
  "globalDefaultModel": {
    "title": "全局默认模型",
    "currentLabel": "当前默认模型",
    "notSet": "尚未设置",
    "configure": "配置",
    "configureTitle": "配置全局默认模型",
    "configureDescription": "设置所有 Agent 的默认模型。未独立设置的 Agent 将使用此模型。"
  },
  "agentModelAssignments": {
    "title": "Agent 模型分配",
    "subtitle": "集中管理所有 Agent 的模型配置",
    "batchSet": "批量设置",
    "inheritedCount": "{{count}} 个 Agent 使用全局默认",
    "overriddenCount": "{{count}} 个 Agent 已独立设置",
    "inherited": "继承",
    "overridden": "已覆盖",
    "editTitle": "编辑 {{name}} 的模型",
    "editDescription": "当前全局默认: {{defaultModel}}",
    "batchTitle": "批量设置 Agent 模型",
    "batchDescription": "为所有 Agent 统一设置模型"
  },
  "toast": {
    "defaultModelUpdated": "全局默认模型已更新",
    "defaultModelCleared": "全局默认模型已清除",
    "batchModelUpdated": "批量设置完成",
    "batchModelUpdateFailed": "批量设置失败: {{error}}"
  }
}
```

- [ ] **Step 2: 英文翻译**

在 `src/i18n/locales/en/agents.json` 添加对应的英文键（内容略，按中文翻译）。

- [ ] **Step 3: 日文/俄文占位**

在 `ja/agents.json` 和 `ru/agents.json` 复制英文键，添加 `"_comment": "TODO: translate"` 标记。

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/
git commit -m "feat(i18n): add model management translations"
```

### Task 4.2: 运行 TypeScript 检查

- [ ] **Step 1: 检查类型**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 2: 运行相关测试**

Run: `npx vitest run tests/unit/agent-config.test.ts tests/unit/agents-routes.test.ts`
Expected: PASS

- [ ] **Step 3: Commit（如需要修复）**

```bash
git add -A
git commit -m "fix: typescript and test fixes for model management"
```

---

## 执行后检查清单

- [ ] 全局默认模型可以在 Models 页面设置和修改
- [ ] Agent 模型分配二级页面可以查看所有 Agent 的模型状态
- [ ] 可以批量设置所有 Agent 的模型
- [ ] 可以重置单个 Agent 为全局默认
- [ ] 修改后 `openclaw.json` 正确更新
- [ ] Gateway 在修改后自动重载
- [ ] 所有 i18n 键在 zh/en/ja/ru 中定义
- [ ] 所有新增代码通过 TypeScript 检查
- [ ] 所有新增/修改函数有单元测试覆盖
