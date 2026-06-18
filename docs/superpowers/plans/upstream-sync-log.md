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

继续同步上游 **v0.4.2 → v0.4.5**。

---

## 版本对照表

| 当前项目版本 | 同步上游版本 | 日期 |
|--------------|--------------|------|
| `0.4.2-beta.2` | `v0.4.2` | 2026-06-18 |

