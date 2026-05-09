# Superpowers 工作流程指南

**创建日期：** 2026-04-26
**目的：** 记录如何指导 Claude 按照工程化、规范化的流程执行任务

---

## 1. 背景：为什么有时候流程规范，有时候很随意

Claude 的默认行为倾向是**直接给出答案**——收到任务后立即尝试解决，缺少结构化的"先规划再执行"流程。

superpowers 框架通过 **Skills** 机制改变了这一点：它把工程化流程编码成可执行的 skill，激活后会强制 Claude 遵循预设的 checklist。

### 触发链分析

```
任务输入 → Claude 判断是否匹配某个 skill → 调用 Skill tool → skill 的 checklist 接管流程
```

**关键瓶颈：第一步的判断。** 如果 Claude 没有识别出任务适合某个 skill，就会回退到默认的"快答"模式。

---

## 2. 本次 UI 美化任务的成功路径

| 阶段 | 触发的 Skill/Agent | 作用 |
|------|-------------------|------|
| 需求分析 | `superpowers:brainstorming` | 强制执行"探索→提问→方案→设计→文档→审查"流程 |
| 项目调研 | `Explore` agent (x2 并行) | 并行研究两个参考项目的 UI 设计 |
| 设计文档 | 直接 Write | 将确认的设计写入规范文档 |
| 文档审查 | `superpowers:code-reviewer` agent | 发现 3 个关键问题、4 个重要问题 |
| 文档修复 | 直接 Edit | 根据审查反馈修复所有问题 |

**核心功劳归于 `brainstorming` skill**——它自带了一套经过验证的产品设计流程：

1. 探索项目上下文（必须先了解现状）
2. 逐个澄清问题（一次只问一个，避免信息过载）
3. 提出 2-3 种方案（附带权衡分析，给出推荐）
4. 分节呈现设计（每节确认后再继续）
5. 编写正式设计文档
6. Spec 审查循环（agent 审查 → 修复 → 再审）
7. 用户审阅（确认后才进入实施）

---

## 3. 可用的 Superpowers Skills 速查表

### 3.1 流程类 Skills（决定 HOW）

| Skill | 触发场景 | 核心流程 |
|-------|---------|---------|
| `superpowers:brainstorming` | 新功能设计、创意任务、从0到1的需求 | 探索→提问→方案→设计→文档→审查 |
| `superpowers:writing-plans` | 已有设计文档，需要拆解为实施步骤 | 读取 spec → 任务拆解 → 依赖排序 → 实施计划 |
| `superpowers:executing-plans` | 已有实施计划，需要执行 | 按计划逐步执行 → 每步审查 checkpoint |
| `superpowers:test-driven-development` | 实现功能或修 bug | 先写测试 → 实现 → 验证 |
| `superpowers:systematic-debugging` | 遇到 bug、测试失败、异常行为 | 收集事实 → 假设 → 验证 → 修复 |
| `superpowers:requesting-code-review` | 完成任务后验证质量 | 审查 vs 计划 → 发现偏差 |
| `superpowers:receiving-code-review` | 收到 review 反馈后处理 | 理解反馈 → 逐条处理 |

### 3.2 辅助类 Skills（增强能力）

| Skill | 触发场景 |
|-------|---------|
| `superpowers:dispatching-parallel-agents` | 2+ 个独立任务可并行 |
| `superpowers:using-git-worktrees` | 需要隔离工作空间 |
| `superpowers:verification-before-completion` | 声称完成前做最终验证 |
| `superpowers:finishing-a-development-branch` | 实现完成，决定如何集成 |

---

## 4. 如何指导 Claude 使用规范化流程

### 方法一：在需求描述中暗示流程（推荐）

在需求中加入流程关键词，帮助 Claude 匹配到正确的 skill：

| 你的表述 | Claude 应该触发的 Skill |
|---------|------------------------|
| "帮我设计/规划/制定方案" | `brainstorming` |
| "按照这个设计开始实施" | `writing-plans` → `executing-plans` |
| "用 TDD 方式实现这个功能" | `test-driven-development` |
| "这个 bug 帮我排查" | `systematic-debugging` |
| "做完了，帮我 review" | `requesting-code-review` |

**示例：**
```
❌ "帮我把这个 UI 改好看一点"        → Claude 可能直接改代码
✅ "帮我设计一个 UI 美化方案"        → 触发 brainstorming
✅ "帮我规划一下这个功能的实现步骤"   → 触发 brainstorming → writing-plans
```

### 方法二：显式要求使用 skill

直接告诉 Claude 要用哪个 skill：
```
"用 brainstorming 流程帮我设计这个功能"
"按 writing-plans 流程拆解实施步骤"
"用 TDD 方式实现这个功能"
```

### 方法三：在 CLAUDE.md 中设置默认行为

在项目的 `CLAUDE.md` 中加入全局指令：

```markdown
## 工作流程规范

- 所有新功能开发必须先经过 brainstorming 流程
- 实施前必须有 written plan
- 完成后必须执行 verification-before-completion
- Bug 修复使用 systematic-debugging 流程
```

这样每次对话都会加载这些指令，Claude 会更倾向于触发对应 skill。

---

## 5. 典型任务场景的推荐流程

### 场景 A：新功能开发（如本次 UI 美化）

```
brainstorming → writing-plans → executing-plans → verification → finishing
```

### 场景 B：Bug 修复

```
systematic-debugging → (如需改代码) test-driven-development → verification
```

### 场景 C：代码重构

```
brainstorming (设计方案) → writing-plans → dispatching-parallel-agents → verification
```

### 场景 D：紧急热修复

```
systematic-debugging → 直接修复 → verification-before-completion
```

---

## 6. 总结

| 问题 | 答案 |
|------|------|
| 为什么今天做得好？ | brainstorming skill 提供了结构化流程 |
| 为什么以前不这样？ | skill 需要主动触发，默认行为是"快答" |
| 下次怎么复现？ | 需求描述中加流程关键词，或在 CLAUDE.md 中设默认规则 |
| 核心原理 | superpowers 把"工程化流程"编码成了 skill，触发即生效 |
