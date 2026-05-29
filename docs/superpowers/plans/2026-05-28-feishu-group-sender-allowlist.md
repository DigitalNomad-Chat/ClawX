# Feishu Group Sender Allowlist UI 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** 在飞书频道编辑页中添加 `groupSenderAllowFrom`（全局群组发送者白名单）和 `resolveSenderNames`（解析发送者名称）配置项，并改进 `groups` placeholder 示例。

**Architecture:** 遵循现有 `ChannelSettingsField` 声明式配置模式，在 `src/types/channel.ts` 的飞书 `access` 面板中新增字段；通过 `electron/utils/channel-config.ts` 的 `ARRAY_CONFIG_KEYS` 确保 textarea 值正确序列化为 JSON 数组；同步更新 4 语言翻译文件。

**Tech Stack:** React + TypeScript + Tailwind, Vitest, i18next

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/types/channel.ts` | 飞书频道元数据：声明 `groupSenderAllowFrom` 和 `resolveSenderNames` 字段 |
| `src/i18n/locales/zh/channels.json` | 简体中文翻译 |
| `src/i18n/locales/en/channels.json` | 英文翻译 |
| `src/i18n/locales/ja/channels.json` | 日文翻译 |
| `src/i18n/locales/ru/channels.json` | 俄文翻译 |
| `electron/utils/channel-config.ts` | 后端配置序列化：将 `groupSenderAllowFrom` 加入 `ARRAY_CONFIG_KEYS` |
| `tests/unit/channel-config.test.ts` | 新增/修改测试：验证 `groupSenderAllowFrom` 按数组序列化 |

---

## Task 1: 前端字段声明 (`src/types/channel.ts`)

**Files:**
- Modify: `src/types/channel.ts:956-984` (feishu access panel fields)

- [ ] **Step 1: 在 `groupAllowFrom` 后插入 `groupSenderAllowFrom` 字段**

```typescript
{
  key: 'groupSenderAllowFrom',
  label: 'channels:fields.groupSenderAllowFrom.label',
  type: 'textarea',
  placeholder: 'channels:fields.groupSenderAllowFrom.placeholder',
  description: 'channels:fields.groupSenderAllowFrom.description',
},
```

- [ ] **Step 2: 在 `requireMention` 前插入 `resolveSenderNames` 字段**

```typescript
{
  key: 'resolveSenderNames',
  label: 'channels:fields.resolveSenderNames.label',
  type: 'checkbox',
  defaultValue: true,
},
```

- [ ] **Step 3: 修改 `groups` placeholder，补充 `allowFrom` 示例**

旧值：`"channels:fields.groups.placeholder"`
新翻译值需包含示例 `{"oc_xxx":{"requireMention":true,"allowFrom":["ou_user1","ou_user2"]}}`

---

## Task 2: 国际化翻译文件

**Files:**
- Modify: `src/i18n/locales/zh/channels.json`
- Modify: `src/i18n/locales/en/channels.json`
- Modify: `src/i18n/locales/ja/channels.json`
- Modify: `src/i18n/locales/ru/channels.json`

- [ ] **Step 1: 在每个翻译文件的 `fields` 对象中添加新键**

zh:
```json
"groupSenderAllowFrom": {
  "label": "全局群组发送者白名单 (groupSenderAllowFrom)",
  "placeholder": "每行一个用户 open_id，例如 ou_xxxxxx",
  "description": "配置后，仅这些用户能在任何群组内触发机器人回复；留空表示不限制。单群组的 allowFrom 优先级更高。"
},
"resolveSenderNames": {
  "label": "解析发送者显示名称 (resolveSenderNames)"
}
```

en:
```json
"groupSenderAllowFrom": {
  "label": "Global Group Sender Allowlist (groupSenderAllowFrom)",
  "placeholder": "One open_id per line, e.g. ou_xxxxxx",
  "description": "When set, only these users can trigger the bot in any group chat. Leave empty to allow all. Per-group allowFrom takes precedence."
},
"resolveSenderNames": {
  "label": "Resolve Sender Display Names (resolveSenderNames)"
}
```

ja / ru: 基于已有翻译风格添加对应翻译。

- [ ] **Step 2: 修改 `groups.placeholder` 为包含 `allowFrom` 示例的新文本**

zh: `"JSON 格式，例如 {\"oc_xxx\":{\"requireMention\":true,\"allowFrom\":[\"ou_user1\",\"ou_user2\"]}}"`
en: `"JSON format, e.g. {\"oc_xxx\":{\"requireMention\":true,\"allowFrom\":[\"ou_user1\",\"ou_user2\"]}}"`

---

## Task 3: 后端配置序列化 (`electron/utils/channel-config.ts`)

**Files:**
- Modify: `electron/utils/channel-config.ts:108-111`

- [ ] **Step 1: 将 `groupSenderAllowFrom` 加入 `ARRAY_CONFIG_KEYS`**

```typescript
const ARRAY_CONFIG_KEYS = new Set([
    'allowFrom',
    'groupAllowFrom',
    'groupSenderAllowFrom',
]);
```

---

## Task 4: 单元测试

**Files:**
- Modify: `tests/unit/channel-config.test.ts`

- [ ] **Step 1: 在现有 describe 中添加测试用例**

测试目标：验证保存飞书配置时，`groupSenderAllowFrom` 的换行分隔字符串被正确序列化为 JSON 数组。

```typescript
it('coerces groupSenderAllowFrom textarea to array on save', async () => {
  const { saveChannelConfig, readOpenClawConfig } = await import('@electron/utils/channel-config');

  await saveChannelConfig(
    'feishu',
    { appId: 'app-123', appSecret: 'secret', groupSenderAllowFrom: 'ou_user1\nou_user2' },
    'default',
  );

  const config = await readOpenClawConfig();
  const feishu = (config.channels as Record<string, unknown>)?.feishu as Record<string, unknown>;
  expect(Array.isArray(feishu?.groupSenderAllowFrom)).toBe(true);
  expect(feishu?.groupSenderAllowFrom).toEqual(['ou_user1', 'ou_user2']);
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/unit/channel-config.test.ts --reporter=verbose`
Expected: PASS

---

## Task 5: 提交

- [ ] **Step 1: 提交所有修改**

```bash
git add src/types/channel.ts src/i18n/locales/*/channels.json electron/utils/channel-config.ts tests/unit/channel-config.test.ts
git commit -m "feat(feishu): add groupSenderAllowFrom and resolveSenderNames to channel config UI"
```
