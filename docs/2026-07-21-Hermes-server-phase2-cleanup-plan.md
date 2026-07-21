# Hermes Server 第二阶段清理计划

> 本计划为 **docs-only**，仅用于指导后续实施。当前阶段不删除任何 server 文件、不改动功能代码。
> 所有结论基于 `feat/membership-system-merge-v0.4.8` 分支在 `b5eda83b` 之后的引用图盘点。

## 1. 现状与范围

- **第一阶段已移除**：Renderer / Setup / Settings / i18n / IPC / preload / Main app-api / docs(Hermes版) / tests 中的 Hermes 产品路径。
- **第二阶段范围**：`server/src/` 下与 Hermes/Koa Web UI 相关的死代码，以及 `electron/main/index.ts` 中为其预留的 `HERMES_*` 环境变量。
- **严格不触碰**：
  - Cloudflare Workers 授权服务（`server/src/index.ts`、`server/src/handlers/*`、`server/src/middleware/auth.ts`、`server/src/utils/*`、`server/src/types.ts`）。
  - Electron 主进程中的 OpenClaw 共享能力（gateway、logs、shell、dialog、settings、cron、extensions 等）。
  - 外部 OpenClaw 运行时自身对 `HERMES_HOME`/`HERMES_AGENT_ROOT` 等环境变量的读取（不在本仓库代码内）。

## 2. 引用图盘点

### 2.1 Koa Web UI 入口（已无人引用）

- `server/src/routes/index.ts` 导出 `registerRoutes`，在仓库内 **没有任何 import**（`grep -R "registerRoutes" server/src electron` 无结果）。
- `package.json`（根目录与 `server/package.json`）中均未声明 `koa` 或 `@koa/router` 依赖；当前 Electron 主进程也不 `import` 任何 `server/src/` 下的 Koa 路由/控制器。
- 因此以 `registerRoutes` 为根的整个 Koa/Hermes 服务端栈当前均为死代码。

### 2.2 Hermes 专用路由 / 控制器 / DB

| 路径 | 说明 | 分类 |
|---|---|---|
| `server/src/routes/hermes/*.ts` | 27 个 Hermes 业务路由文件 | 可删除 |
| `server/src/controllers/hermes/*.ts` | 所有 Hermes 业务控制器 | 可删除 |
| `server/src/db/hermes/*.ts` | Hermes 专用 SQLite/JSON 存储层 | 可删除 |

### 2.3 普通 Koa 路由 / 控制器（随 Koa 入口一起成为死代码）

| 路径 | 说明 | 分类 |
|---|---|---|
| `server/src/routes/{health,auth,upload,update,webhook}.ts` | Koa 公共/认证/上传/更新/Webhook 路由 | 可删除 |
| `server/src/controllers/{health,auth,upload,update,webhook}.ts` | 对应控制器 | **Batch C** |

> 注意：`server/src/controllers/health.ts` 导入了 `services/hermes/hermes-cli` 获取 Hermes 版本，属于产品逻辑；因依赖 Batch C 要删除的服务，这些控制器在 Batch C 开头删除。

### 2.4 Koa 专用服务

| 路径 | 当前被谁引用 | 分类 |
|---|---|---|
| `server/src/services/auth.ts` | `controllers/auth.ts` | 可删除 |
| `server/src/services/credentials.ts` | `services/auth.ts`、`controllers/auth.ts` | 可删除 |
| `server/src/services/login-limiter.ts` | `controllers/auth.ts` | 可删除 |
| `server/src/services/app-config.ts` | `controllers/hermes/copilot-auth.ts`、`controllers/hermes/models.ts` | 可删除 |
| `server/src/services/safe-file-store.ts` | `services/config-helpers.ts`、`controllers/hermes/config.ts/weixin.ts/profiles.ts` | 可删除 |
| `server/src/services/logger.ts` | 大量 Hermes/Koa 文件 | 可删除 |
| `server/src/services/gateway-bootstrap.ts` | `controllers/hermes/*`、`controllers/health.ts`、`services/shutdown.ts` | 可删除 |
| `server/src/services/shutdown.ts` | 无人引用 | 可删除 |
| `server/src/services/config-helpers.ts` | `controllers/hermes/*`、`services/hermes/run-chat/*` | 可删除 |

### 2.5 Hermes 专用服务

| 路径 | 说明 | 分类 |
|---|---|---|
| `server/src/services/hermes/agent-bridge/*` | Agent Bridge 客户端/管理器/Python 桥接 | 可删除 |
| `server/src/services/hermes/context-engine/*` | 上下文压缩引擎 | 可删除 |
| `server/src/services/hermes/conversations.ts` | 会话导出 | 可删除 |
| `server/src/services/hermes/copilot-device-flow.ts` | Copilot OAuth 设备流 | 可删除 |
| `server/src/services/hermes/copilot-models.ts` | Copilot 模型解析 | 可删除 |
| `server/src/services/hermes/file-provider.ts` | 文件服务 | 可删除 |
| `server/src/services/hermes/gateway-manager.ts` | Koa Gateway 管理器 | 可删除 |
| `server/src/services/hermes/group-chat/*` | 群聊服务 | 可删除 |
| `server/src/services/hermes/hermes-cli.ts` | Hermes CLI 调用封装 | 可删除 |
| `server/src/services/hermes/hermes-kanban.ts` | Hermes Kanban CLI 调用 | 可删除 |
| `server/src/services/hermes/hermes-path.ts` | Hermes 安装路径探测 | 可删除 |
| `server/src/services/hermes/hermes-profile.ts` | Hermes profile 路径解析 | 可删除 |
| `server/src/services/hermes/model-context.ts` | 模型上下文缓存 | 可删除 |
| `server/src/services/hermes/plugins.ts` | Hermes 插件列表 | 可删除 |
| `server/src/services/hermes/profile-credentials.ts` | Profile 凭据 | 可删除 |
| `server/src/services/hermes/run-chat/*` | Chat 运行引擎 | 可删除 |
| `server/src/services/hermes/session-deleter.ts` | 会话删除 | 可删除 |
| `server/src/services/hermes/session-sync.ts` | 会话同步 | 可删除 |
| `server/src/services/hermes/tts.ts` | TTS 服务 | 可删除 |

### 2.6 Koa 专用库

| 路径 | 说明 | 分类 |
|---|---|---|
| `server/src/lib/context-compressor/*` | 仅被 `services/hermes/run-chat/*`、`controllers/hermes/sessions.ts` 引用 | 可删除 |

### 2.7 配置与数据（需先确认是否为共享基础设施）

| 路径 | 当前引用方 | 分类 | 备注 |
|---|---|---|---|
| `server/src/config.ts` | `services/auth.ts`、`credentials.ts`、`logger.ts`、`app-config.ts`、`login-limiter.ts`、`controllers/upload.ts`、`db/index.ts` | **可删除** | 授权服务（Cloudflare Workers）不使用该文件；它直接读取 `env` |
| `server/src/db/index.ts` | 仅 Koa 服务 | **可删除** | 授权服务使用 D1，不依赖 Node SQLite |

> 如果后续发现 `server/src/config.ts` 或 `server/src/db/index.ts` 被授权服务或其他非 Koa 路径引用，立即将其从“可删除”改为“需改名保留”。

### 2.8 环境变量与目录

| 变量 / 目录 | 当前设置/使用位置 | 分类 | 处理建议 |
|---|---|---|---|
| `HERMES_WEB_UI_HOME` | `electron/main/index.ts` 设置；`server/src/config.ts` 读取 | **HOLD（暂缓删除）** | Koa 删除后，若确认无外部 runtime/脚本读取，再从 `electron/main/index.ts` 移除；否则保留为兼容 alias |
| `HERMES_WEBUI_STATE_DIR` | `server/src/config.ts` 兼容别名 | **HOLD** | 随 `config.ts` 删除；Electron 侧未设置 |
| `HERMES_DATA_DIR` | `electron/main/index.ts` 设置；`server/src/config.ts` 读取 | **HOLD** | 同 `HERMES_WEB_UI_HOME` |
| `HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN` | `electron/main/index.ts` 设置；`services/shutdown.ts`、`services/hermes/gateway-manager.ts` 读取 | **HOLD** | 同 `HERMES_WEB_UI_HOME` |
| `HERMES_HOME` / `HERMES_AGENT_ROOT` / `HERMES_BIN` / `HERMES_MODEL` 等 | 外部 OpenClaw runtime 可能读取 | **保留** | 不在本仓库代码中设置，禁止在本阶段删除或改名 |
| `~/.hermes-web-ui` / `~/.hermes` / `<userData>/hermes` | 由 Koa 配置推导 | 资源审计 | 确认无授权服务使用后，在后续版本中迁移或重命名 |

### 2.9 Runtime 依赖证明（当前分支可复现）

以下命令证明 Koa/Hermes 服务端栈当前不被 OpenClaw 运行时依赖：

```bash
# 1. Koa 入口 registerRoutes 无人引用
grep -RIn "registerRoutes" server/src electron
# 预期输出：仅 server/src/routes/index.ts 自身的定义

# 2. Electron 主进程不引用任何 server/src 下的 Koa 路由/控制器/服务
grep -RIn "from ['\"].*server/src" electron
# 预期输出：无（仅有注释提及 server/src/config.ts）

# 3. package.json 未声明 Koa 运行时依赖
grep -Ein "koa|@koa/router" package.json server/package.json
# 预期输出：无

# 4. 授权服务（Cloudflare Workers）入口不依赖 Koa
grep -RIn "Koa\\|koa" server/src/index.ts server/src/handlers server/src/middleware
# 预期输出：无
```

> 若以上任何一条在实施后发生变化（例如新代码开始 import `registerRoutes` 或 Koa 依赖被重新加入），立即停止并重新评估。

## 3. 分批清理方案

每批都是 **独立 commit**，每批完成后必须验证并通过再进入下一批。

### Batch A：移除 Koa/Hermes 路由入口

- 删除：
  - `server/src/routes/index.ts`
  - `server/src/routes/hermes/*.ts`（共 27 个文件）
  - `server/src/routes/{health,auth,upload,update,webhook}.ts`
- 验证：
  - `grep -R "registerRoutes" server/src electron` 无结果。
  - `pnpm run typecheck`（根项目 + `pnpm --filter clawx-license-server run typecheck`）。
- Stop 条件：若发现 `registerRoutes` 仍被非测试代码引用，停止并报告。

### Batch B：移除 Hermes 控制器与 DB

- 删除：
  - `server/src/controllers/hermes/*.ts`
  - `server/src/db/hermes/*.ts`
- 验证：
  - 无 `from '../../controllers/hermes'`、`from '../../db/hermes'` 等遗留 import。
  - `pnpm run typecheck`。
- Stop 条件：若任何被删控制器仍被授权服务引用，停止。

> 注：Batch B 完成后，`server/src/controllers/{health,auth,upload,update,webhook}.ts` 仍保留。它们依赖 Batch C 要删除的服务（`services/hermes/hermes-cli`、`services/gateway-bootstrap`、`services/auth`、`services/credentials`、`services/login-limiter`、`services/logger`、`config`），因此移至 Batch C 开头删除。

### Batch C：移除 Hermes/Koa 服务、辅助库与遗留控制器

- 删除顺序（必须按此顺序，否则会出现遗留 import 导致 typecheck 失败）：
  1. `server/src/controllers/{health,auth,upload,update,webhook}.ts`（Batch A 后已成为死代码，且依赖下列服务）
  2. `server/src/services/hermes/*`（整个目录）
  3. `server/src/services/{auth,credentials,login-limiter,app-config,safe-file-store,logger,gateway-bootstrap,shutdown,config-helpers}.ts`
  4. `server/src/lib/context-compressor/*`
- 验证：
  - 无 `from '*/services/hermes/*'`、`from '*/services/auth'`、`from '*/controllers/health'` 等遗留 import。
  - `pnpm run typecheck`。
- Stop 条件：若发现服务被授权服务或 Electron 主进程引用，停止并将其移出本批。

### Batch D：移除 Koa 配置，HOLD electron/main 环境变量

- 删除：
  - `server/src/config.ts`
  - `server/src/db/index.ts`（若 Batch C 后无引用）
- 对 `electron/main/index.ts` 中的三个 Web UI 专用 env 改为 **HOLD**，不立即删除：
  - `HERMES_WEB_UI_HOME`
  - `HERMES_DATA_DIR`
  - `HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN`
- HOLD 决策条件：
  1. Batch A/B/C 完成后，确认 `server/src/` 与 `electron/` 中已无读取方（`grep -R` 无结果）。
  2. 检查外部 OpenClaw runtime、打包脚本、安装/升级脚本、文档中是否引用这三个变量；若存在引用，保留为兼容 alias 或提供迁移脚本，不能直接删除。
  3. 在干净环境（新用户目录）中启动应用，确认不依赖这三个 env 也能正常运行。
  4. 若 1-3 全部通过，方可删除；否则保留并上报。
- 验证：
  - `pnpm run typecheck`。
  - Electron 应用可正常启动（`pnpm dev` 或 E2E smoke）。
  - 干净环境启动后，检查 `process.env` 中无 `HERMES_WEB_UI_HOME` / `HERMES_DATA_DIR` / `HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN` 泄漏（可通过 Main 进程 `app.evaluate` 打印）。
- Stop 条件：若这三个 env 被授权服务或非 Koa 代码读取，立即停止并报告。

### Batch E：依赖与运行时资源审计

- 依赖：
  - 检查根 `package.json`、`server/package.json` 是否还有直接声明的 `hermes-*` 依赖（目前仅存在 `eslint-plugin-react-hooks` 的传递依赖 `hermes-parser`，不是 Hermes 产品，无需处理）。
- 资源：
  - 列出运行时可能创建的目录：`~/.hermes-web-ui`、`~/.hermes`、`<userData>/hermes`。
  - 确认 Electron/OpenClaw 运行时已不再写入这些路径后，制定迁移/重命名方案（不强制在本次完成）。
- 验证：
  - `pnpm run typecheck`、`pnpm run harness:ci`。
  - 在干净环境中启动应用，确认无 `hermes` 相关目录新建。

### 干净环境验证步骤（Batch D/E 复用）

1. 创建新的临时用户目录：
   ```bash
   export HOME=$(mktemp -d)
   ```
2. 启动 Electron 应用：
   ```bash
   pnpm dev
   # 或运行 E2E smoke：pnpm exec playwright test tests/e2e/smoke.spec.ts
   ```
3. 检查 Main 进程环境变量：
   ```js
   await app.evaluate(() => ({
     HERMES_WEB_UI_HOME: process.env.HERMES_WEB_UI_HOME,
     HERMES_DATA_DIR: process.env.HERMES_DATA_DIR,
     HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN: process.env.HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN,
   }));
   ```
   预期：上述三个变量未定义（若已删除）或仍为兼容 alias（若决定保留）。
4. 检查文件系统：
   ```bash
   ls -la "$HOME/.hermes-web-ui" "$HOME/.hermes" 2>&1 || true
   ```
   预期：不存在，或已被新的 OpenClaw 目录替代。
5. Stop 条件：若发现应用仍依赖 `HERMES_*` Web UI 变量才能启动，或仍在新建 `~/.hermes*` 目录，停止并报告。

## 4. 测试与验证矩阵

| 验证项 | 每批 | Batch D 额外 | Batch E 额外 |
|---|---|---|---|
| `git status --short` 仅含本批文件 | ✅ | ✅ | ✅ |
| `git diff --check` 无空白错误 | ✅ | ✅ | ✅ |
| `pnpm run typecheck`（根） | ✅ | ✅ | ✅ |
| `pnpm --filter clawx-license-server run typecheck` | ✅ | ✅ | ✅ |
| `pnpm run harness:ci` | ✅ | ✅ | ✅ |
| `pnpm run comms:replay` + `comms:compare` | ✅（如改到通信路径） | - | - |
| Electron 启动/E2E smoke | - | ✅ | ✅ |
| 搜索残留 `Hermes` / `hermes` / `HERMES_` | - | ✅ | ✅ |

## 5. 回滚策略

- 每批一个独立 commit，提交信息前缀使用 `chore(hermes-server): ...`。
- 回滚时执行 `git revert <batch-sha>`，**禁止**使用 `git reset --hard`、`git checkout --`、`git stash pop` 等破坏性命令处理共享工作树。
- 若某批 revert 后产生冲突，停止并报告，不强制覆盖。

## 6. 停止与上报条件

在任意批次中，若出现以下情况，立即停止当前批及后续批，并向 leader 报告：

1. `git status` 出现本计划范围外的变更（例如 B5、chat、media、proxy、用户配置、agent 产出等）。
2. 发现被标记为“可删除”的文件实际上仍被授权服务（`server/src/handlers/*`、`server/src/index.ts`）或 Electron 主进程引用。
3. `pnpm run typecheck` 或 `pnpm run harness:ci` 失败。
4. Electron 启动失败或 E2E smoke 失败。
5. 遇到需要覆盖他人/WIP 变更的冲突。

## 7. 共用基础设施保护清单

以下文件/能力当前服务于 OpenClaw 或非 Hermes 功能，**不得**在本阶段删除：

- `electron/main/index.ts` 中的 gateway 启动、logs、shell、dialog、settings、cron、extensions、modules、providers、skill-config 等。
- `server/src/index.ts` 及 `server/src/handlers/*`（授权服务）。
- `server/src/middleware/auth.ts`、`server/src/utils/*`、`server/src/types.ts`。
- OpenClaw Gateway 自身进程与配置（位于 `electron/gateway/*`、外部 `openclaw` 运行时）。

---

**结论**：第二阶段可通过 5 个独立批次，安全移除整个 Koa/Hermes 服务端死代码栈，并清理 `electron/main/index.ts` 中为其保留的环境变量。所有共用基础设施（授权服务、Electron 主进程 OpenClaw 能力）均不在删除范围内。
