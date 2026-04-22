# ClawX 独立内核 Agent 安全加固方案

> 制定日期：2026-04-22
> 参考项目：OpenHarness (Anthropic 官方 Agent 框架)
> 状态：待实施

---

## 一、当前风险态势

经过代码审计，ClawX 内核当前的 Agent 工具链**完全没有沙箱边界**：

| 工具 | 当前行为 | 风险等级 |
|------|---------|---------|
| `file_read` | `resolve(path)` 后直接读取任意路径 | 极高 |
| `file_write` | `resolve(path)` 后直接写入任意路径，可递归创建目录 | 极高 |
| `bash` | 直接 `exec(command)`，无命令过滤，无超时上限 | 极高 |
| `web_fetch` | 直接 `fetch(url)`，无域名限制，支持自定义 headers/body | 高 |

**具体攻击场景：**
- Agent 可被诱导读取 `~/.ssh/id_rsa`、`~/.claude/projects/*/memory/*`、系统 keychain 文件
- Agent 可写入 `/etc/hosts`、覆盖 `~/.bashrc` 植入持久化后门、删除任意文件
- Agent 可执行 `rm -rf /`、`curl \| bash`、将敏感文件外传到远程服务器
- `web_fetch` 的自定义 headers 可用于携带本地密钥访问外部 API

---

## 二、OpenHarness 安全模型借鉴

OpenHarness 采用了**四层纵深防御**架构，以下是可以直接借鉴到 ClawX 的设计模式：

### 2.1 权限模式（Permission Mode）

```python
class PermissionMode(str, Enum):
    DEFAULT = "default"      # 只读工具自动通过；变异工具需用户确认
    PLAN = "plan"            # 计划模式：完全禁止变异工具
    FULL_AUTO = "full_auto"  # 全自动：允许所有（显式配置后）
```

**借鉴点：** ClawX 应在 Agent 配置中增加 `permissionMode` 字段，默认 `default`。

### 2.2 权限检查器（PermissionChecker）

检查顺序：
1. 显式工具黑名单 -> 直接拒绝
2. 显式工具白名单 -> 直接允许
3. 路径规则匹配（glob 模式）-> 命中 deny 则拒绝
4. 命令拒绝模式（如 `rm -rf *`）-> 命中则拒绝
5. 模式判断：`FULL_AUTO` 全过 / `PLAN` 挡变异 / `DEFAULT` 挡变异但可确认

**借鉴点：** 在 `ToolRegistry.execute()` 前插入 `PermissionChecker.evaluate()`。

### 2.3 工作空间隔离（Workspace Isolation）

OpenHarness 的每个 Agent/用户拥有独立工作空间 `~/.ohmo`，包含：
- `soul.md` -- Agent 身份定义
- `user.md` -- 用户画像
- `memory/` -- 持久化记忆
- `sessions/` -- 会话历史
- `attachments/` -- 附件

**文件工具的路径解析规则：** 所有相对路径都基于 `context.cwd`（即工作空间根目录），Agent 默认只能在自身工作空间内操作。

**借鉴点：** ClawX 应为每个 Agent Session 分配独立工作目录，文件工具的所有相对路径以此为根。

### 2.4 OS 级沙箱（Sandbox Runtime）

OpenHarness 集成了 `@anthropic-ai/sandbox-runtime`（`srt` CLI），通过 OS 原生机制限制子进程：
- **macOS**: `sandbox-exec` 生成禁止网络/文件访问的子进程
- **Linux/WSL**: `bubblewrap (bwrap)` 命名空间隔离
- **网络**: 允许/拒绝域名列表
- **文件系统**: 允许读/写路径列表、拒绝读/写路径列表

**借鉴点：** ClawX 的 `bash` 工具应优先通过 `sandbox-exec` / `bwrap` 执行命令，失败时回退或拒绝（根据配置）。

### 2.5 只读工具自声明

OpenHarness 的 `BaseTool` 基类要求每个工具实现 `is_read_only()` 方法，使得权限系统可以**自动放行**所有只读操作（如 `read_file`, `glob`, `grep`, `web_fetch`），只对变异操作施加限制。

**借鉴点：** ClawX 的 `ToolDefinition` 增加 `isReadOnly: boolean` 字段。

---

## 三、ClawX 分层防御架构设计

```
+---------------------------------------------------------+
|  Layer 1: 配置层 (Agent Config)                          |
|  - permissionMode: 'default' | 'plan' | 'full_auto'     |
|  - toolWhitelist / toolBlacklist（已有）                 |
|  - pathRules: [{ pattern: '**/.ssh/*', allow: false }] |
|  - commandDenyList: ['rm -rf *', 'curl | bash']         |
|  - allowedDomains / deniedDomains（网络）                |
|  - workspaceRoot: string（每个 Agent 隔离）              |
+---------------------------------------------------------+
|  Layer 2: 权限检查层 (PermissionChecker)                 |
|  - 工具名黑白名单                                          |
|  - 路径 glob 规则匹配                                      |
|  - 命令模式匹配                                            |
|  - 只读工具自动放行                                        |
|  - 变异工具根据 mode 决策：允许 / 拒绝 / 需确认            |
+---------------------------------------------------------+
|  Layer 3: 工作空间隔离层 (Workspace Sandbox)              |
|  - 所有相对路径解析到 Agent 专属工作目录                     |
|  - 绝对路径必须经过 allow-list 校验                        |
|  - 禁止访问父目录外的敏感路径（~/.ssh, /etc, keychain 等） |
+---------------------------------------------------------+
|  Layer 4: OS 级沙箱层 (Optional)                         |
|  - bash 工具通过 sandbox-exec / bwrap 执行                 |
|  - 网络访问受域名列表限制                                   |
|  - 文件访问受 allow/deny 列表限制                          |
+---------------------------------------------------------+
|  Layer 5: 审计与审批层 (Audit & Approval)                |
|  - 关键操作生成 approval.request 事件到前端                 |
|  - 前端弹窗让用户确认/拒绝                                  |
|  - 所有工具调用记录到 session 日志                          |
+---------------------------------------------------------+
```

---

## 四、具体加固措施

### 阶段 A：立即加固（零依赖，纯代码层）

#### A1. 工作空间隔离

为每个 Agent Session 创建独立工作目录：

```typescript
// kernel/src/engine/session-manager.ts
interface Session {
  id: string;
  agentId: string;
  agentConfig: AgentConfig;
  messages: Message[];
  workspaceRoot: string;  // 新增
}
```

目录结构：
```
<appData>/ClawX/agents-workspace/<agentId>/<sessionId>/
+-- memory/          # Agent 持久化记忆
+-- uploads/         # 用户上传附件
+-- output/          # Agent 生成文件
+-- state.json       # 会话状态
```

**文件工具改造：**
- 相对路径 -> 以 `workspaceRoot` 为根
- 绝对路径 -> **拒绝**，除非命中 `allowedAbsolutePaths` 规则

#### A2. 权限检查器（PermissionChecker）

新建 `kernel/src/security/permission-checker.ts`：

- 三层决策链：工具黑白名单 -> 路径 glob 规则 -> 命令模式过滤
- 模式判断：`FULL_AUTO` 全过 / `PLAN` 挡变异 / `DEFAULT` 挡变异但可确认

#### A3. ReAct Loop 集成审批流

修改 `kernel/src/engine/react-loop.ts`，在 `toolRegistry.execute()` 前插入权限检查：

- `allowed: false` -> 直接拒绝
- `requiresConfirmation: true` -> 发送 `approval.request` 事件，暂停 ReAct loop 等待前端响应
- 超时机制（默认 5 分钟）

#### A4. 工具自声明只读属性

修改 `types.ts`，`ToolDefinition` 增加 `isReadOnly?: boolean` 字段：
- `file_read` -> `true`
- `web_fetch` -> `true`
- `file_write` -> `false`
- `bash` -> `false`

#### A5. Bash 工具加固

- 默认超时 120s，最大 600s
- 输出截断 12000 字符
- 内置命令拒绝模式：`rm -rf /`, `curl *| *sh`, `mkfs.*` 等

#### A6. Web Fetch 加固

- 域名黑白名单限制
- Method 限制为 GET/POST
- Body 大小限制

#### A7. 敏感路径黑名单（硬编码）

无论配置如何，以下路径默认禁止访问：

```
**/.ssh/**, **/.gnupg/**, **/.aws/**, **/.azure/**,
**/id_rsa*, **/id_ed25519*, **/.env*, **/.claude/**/memory/**,
**/keychain*/**, **/Library/Keychains/**, **/credentials*,
/etc/shadow, /etc/passwd, /etc/hosts,
```

### 阶段 B：OS 级沙箱（依赖外部工具，可选启用）

#### B1. macOS sandbox-exec 集成

为 `bash` 工具增加 sandbox 包装，通过 `sandbox-exec -p <profile>` 执行命令。

#### B2. Linux bubblewrap 集成

通过 `bwrap --unshare-all --bind <cwd> <cwd> ...` 执行命令。

#### B3. 配置开关

Agent 配置增加：
- `sandboxEnabled?: boolean`
- `sandboxFailIfUnavailable?: boolean`（true = 沙箱不可用则拒绝执行）

### 阶段 C：前端审批 UI

#### C1. IPC 通道扩展

内核发送 `approval.request` -> Main 转发到前端 -> 前端发送 `approval.respond` -> Main 转发到内核。

#### C2. AgentChat 审批弹窗

在 `AgentChat/index.tsx` 中监听 `approval.request` 事件，展示工具名和参数，提供「允许一次」「始终允许」「拒绝」按钮。

---

## 五、Agent 配置扩展

更新 `AgentConfig` 接口：

```typescript
export interface AgentConfig {
  // ... existing fields
  permissionMode?: 'default' | 'plan' | 'full_auto';
  pathRules?: { pattern: string; allow: boolean }[];
  commandDenyList?: string[];
  allowedDomains?: string[];
  deniedDomains?: string[];
  allowedAbsolutePaths?: string[];
  sandboxEnabled?: boolean;
  sandboxFailIfUnavailable?: boolean;
  workspaceIsolation?: boolean; // 默认 true
}
```

---

## 六、实施优先级与预估工作量

| 优先级 | 措施 | 文件变更 | 预估时间 | 依赖 |
|-------|------|---------|---------|------|
| **P0** | A1 工作空间隔离（路径解析） | `file-read.ts`, `file-write.ts`, `session-manager.ts` | 2h | 无 |
| **P0** | A5 Bash 工具基础加固（超时、输出截断、内置拒绝模式） | `bash.ts` | 1h | 无 |
| **P0** | A7 敏感路径硬编码黑名单 | `file-read.ts`, `file-write.ts` | 1h | 无 |
| **P1** | A2 + A4 权限检查器 + 工具只读声明 | 新增 `permission-checker.ts`, 改 `types.ts`, `registry.ts` | 3h | 无 |
| **P1** | A3 ReAct Loop 审批流集成 | `react-loop.ts`, `session-manager.ts`, `types.ts` | 4h | P1 |
| **P1** | A6 Web Fetch 域名限制 | `web-fetch.ts` | 1h | 无 |
| **P2** | C1 + C2 前端审批 UI | `AgentChat/index.tsx`, `preload/index.ts`, `main/index.ts` | 4h | P1 |
| **P3** | B1 + B2 OS 级沙箱集成 | 新增 `sandbox.ts`, 改 `bash.ts` | 4h | 外部工具 |
| **P3** | 会话审计日志 | 新增 `audit-logger.ts` | 2h | 无 |

**P0+P1 总工作量约 12 小时，可在一个迭代内完成。**

---

## 七、Harness 视角的额外优化建议

1. **Agent 工作空间模板化**：像 Harness 的 `SOUL.md`、`USER.md` 模板一样，每个 Agent 的 `workspaceRoot` 初始化时可自动生成 `README.md`（Agent 自我说明）和 `rules.md`（该 Agent 的行为边界），既提升用户体验，也强化安全边界意识。

2. **`ToolExecutionContext` 传递模式**：Harness 在每个工具调用时注入 `cwd` 和 `metadata`。ClawX 可以扩展此模式，将 `workspaceRoot`、`sessionId`、`permissionChecker` 都注入 `execute` 的第三个参数，避免全局状态。

3. **配置热更新**：Harness 支持运行时修改 `settings.json` 无需重启。ClawX 内核的 `kernel.updateConfig` 已实现类似能力，可以扩展为 Agent 配置热重载（如动态调整 `permissionMode`）。

4. **权限规则持久化学习**：Harness 的 `permission_updates` 机制允许用户在审批时选择「始终允许类似操作」，系统会自动生成新的 path/command 规则。ClawX 未来可以借鉴，减少重复确认。

---

## 八、参考文件

- OpenHarness 权限检查器：`/Users/a1-6/办公/GitHub/Harness-Agents/OpenHarness-main/OpenHarness-main/src/openharness/permissions/checker.py`
- OpenHarness 权限模式：`/Users/a1-6/办公/GitHub/Harness-Agents/OpenHarness-main/OpenHarness-main/src/openharness/permissions/modes.py`
- OpenHarness 沙箱适配器：`/Users/a1-6/办公/GitHub/Harness-Agents/OpenHarness-main/OpenHarness-main/src/openharness/sandbox/adapter.py`
- OpenHarness 工作空间：`/Users/a1-6/办公/GitHub/Harness-Agents/OpenHarness-main/OpenHarness-main/ohmo/workspace.py`
- OpenHarness 设置模型：`/Users/a1-6/办公/GitHub/Harness-Agents/OpenHarness-main/OpenHarness-main/src/openharness/config/settings.py`
