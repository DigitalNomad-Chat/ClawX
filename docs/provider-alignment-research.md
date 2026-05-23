# OpenClaw Provider 对齐调研报告

> 基于当前 ClawDock 项目与 OpenClaw 2026.4.20 版本的 Provider 生态对比分析
> 调研日期: 2026-05-23

---

## 一、当前状态总览

### ClawDock 现有 Provider（14个）

| ClawDock ID | OpenClaw 对应 Plugin/Provider | 状态 |
|-------------|------------------------------|------|
| `anthropic` | `anthropic` | 正常 |
| `openai` | `openai-codex` | 名称映射缺失，密钥读取异常 |
| `google` | `google-gemini-cli` | 名称映射缺失，密钥读取异常 |
| `openrouter` | `openrouter` | 正常 |
| `ark` | `volcengine` | 对应关系不完整 |
| `moonshot` | `moonshot` | 正常（CN端点） |
| `moonshot-global` | `moonshot` | 正常（Global端点） |
| `siliconflow` | 无独立插件 | **缺失** |
| `deepseek` | `deepseek` | 正常 |
| `minimax-portal` | `minimax-portal` | 正常（Global OAuth/API） |
| `minimax-portal-cn` | `minimax` | 正常（CN OAuth/API） |
| `modelstudio` | `qwen` | 仅覆盖 Coding Plan Global |
| `ollama` | `ollama` | 正常 |
| `custom` | `custom-api-key` | 正常 |

---

## 二、OpenClaw 完整 Provider 列表（54个）

### A. 大模型推理 Provider（已支持核心能力）

| # | Provider ID | 名称 | 认证方式 | 默认模型 | 端点 |
|---|-------------|------|----------|----------|------|
| 1 | `anthropic` | Anthropic | OAuth + API Key | `claude-opus-4-6` | api.anthropic.com |
| 2 | `openai-codex` | OpenAI Codex | OAuth + API Key | `gpt-5.4` | api.openai.com |
| 3 | `google-gemini-cli` | Google Gemini | OAuth + API Key | `gemini-3-pro-preview` | generativelanguage.googleapis.com |
| 4 | `openrouter` | OpenRouter | API Key | `anthropic/claude-opus-4.6` | openrouter.ai/api/v1 |
| 5 | `moonshot` | Moonshot/Kimi | API Key (.ai/.cn) | `kimi-k2.6` | api.moonshot.ai / .cn |
| 6 | `kimi-coding` | Kimi Coding Plan | API Key | `kimi-code` | api.kimi.com/coding |
| 7 | `deepseek` | DeepSeek | API Key | `deepseek-chat` | api.deepseek.com |
| 8 | `minimax` | MiniMax Coding | API Key (Global/CN) | `MiniMax-M2.7` | api.minimax.io |
| 9 | `minimax-portal` | MiniMax Portal | OAuth (Global/CN) | `MiniMax-M2.7` | api.minimax.io |
| 10 | `qwen` | Qwen Cloud | API Key (4种套餐) | `qwen3.5-plus` | dashscope.aliyuncs.com |
| 11 | `zai` | Z.AI / GLM | API Key (5种套餐) | `glm-5` | api.z.ai / open.bigmodel.cn |
| 12 | `xai` | xAI / Grok | API Key | `grok-4` | api.x.ai/v1 |
| 13 | `groq` | Groq | API Key | - | api.groq.com |
| 14 | `mistral` | Mistral AI | API Key | `mistral-large-latest` | api.mistral.ai |
| 15 | `together` | Together AI | API Key | - | api.together.xyz |
| 16 | `fireworks` | Fireworks AI | API Key | `accounts/fireworks/models/kimi-k2p6` | api.fireworks.ai |
| 17 | `nvidia` | NVIDIA | API Key | `nvidia/nemotron-3-super-120b` | integrate.api.nvidia.com |
| 18 | `stepfun` | Stepfun (阶跃) | API Key (Standard/Plan) | `step-3.5-flash` | api.stepfun.com |
| 19 | `volcengine` | Volcengine/豆包 | API Key | `doubao-seed-1-8` | ark.cn-beijing.volces.com |
| 20 | `volcengine-plan` | Volcengine Coding | API Key | `ark-code-latest` | ark.cn-beijing.volces.com |
| 21 | `qianfan` | 百度千帆 | API Key | - | - |
| 22 | `xiaomi` | 小米 | API Key | - | - |
| 23 | `byteplus` | BytePlus | API Key | - | - |
| 24 | `tencent-tokenhub` | 腾讯 TokenHub | API Key | - | - |
| 25 | `chutes` | Chutes | OAuth + API Key | - | - |
| 26 | `arcee` | Arcee AI | API Key + OpenRouter | - | - |
| 27 | `venice` | Venice AI | API Key | - | - |
| 28 | `kilocode` | Kilocode | API Key | - | - |
| 29 | `synthetic` | Synthetic | API Key | - | - |
| 30 | `copilot-proxy` | Copilot Proxy | OAuth | - | - |
| 31 | `github-copilot` | GitHub Copilot | OAuth | - | - |
| 32 | `codex` | OpenAI Codex CLI | OAuth | - | - |
| 33 | `opencode` | Opencode | API Key | - | - |
| 34 | `opencode-go` | Opencode Go | API Key | - | - |
| 35 | `anthropic-vertex` | Anthropic Vertex | - | - | - |
| 36 | `huggingface` | HuggingFace | API Key | - | - |
| 37 | `amazon-bedrock` | AWS Bedrock | - | - | - |
| 38 | `amazon-bedrock-mantle` | AWS Bedrock Mantle | - | - | - |
| 39 | `microsoft-foundry` | Microsoft Foundry | Entra + API Key | - | - |
| 40 | `cloudflare-ai-gateway` | Cloudflare AI Gateway | API Key | - | - |
| 41 | `vercel-ai-gateway` | Vercel AI Gateway | API Key | - | - |
| 42 | `litellm` | LiteLLM | API Key | - | - |
| 43 | `vllm` | vLLM | Local | - | - |
| 44 | `sglang` | SGLang | API Key | - | - |
| 45 | `lmstudio` | LMStudio | Local | - | localhost:1234 |

### B. 仅支持辅助能力的 Provider（图片/语音/视频/搜索）

| # | Provider ID | 能力 |
|---|-------------|------|
| 46 | `fal` | 图片/视频生成 |
| 47 | `comfy` | 图片/音乐/视频生成 |
| 48 | `vydra` | 语音/图片/视频生成 |
| 49 | `deepgram` | 实时语音转录 |
| 50 | `elevenlabs` | 语音合成 |
| 51 | `brave` | 网页搜索 |
| 52 | `duckduckgo` | 网页搜索 |
| 53 | `tavily` | 网页搜索 |
| 54 | `exa` | 网页搜索 |

---

## 三、缺失 Provider 详细定义

### P0 - 高优先级（国内主流 / 已部分支持但缺失套餐）

#### 3.1 Kimi Coding Plan (`kimi-coding`)

```typescript
{
  id: 'kimi-coding',
  name: 'Kimi Coding Plan',
  icon: '🌙',
  placeholder: 'sk-...',
  model: 'Kimi Code',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.kimi.com/coding/',
  defaultModelId: 'kimi-code',
  apiProtocol: 'anthropic-messages',
  category: 'official',
  envVar: 'KIMI_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  supportsMultipleAccounts: true,
  providerConfig: {
    baseUrl: 'https://api.kimi.com/coding/',
    api: 'anthropic-messages',
    apiKeyEnv: 'KIMI_API_KEY',
    headers: { 'User-Agent': 'claude-code/0.1.0' },
    models: [
      { id: 'kimi-code', name: 'Kimi Code', reasoning: true, input: ['text', 'image'], contextWindow: 262144, maxTokens: 32768 },
      { id: 'k2p5', name: 'Kimi Code (legacy)', reasoning: true, input: ['text', 'image'], contextWindow: 262144, maxTokens: 32768 }
    ]
  }
}
```

> **说明**: 这是 Kimi 的编程订阅版，与 `moonshot` 的普通 API 不同。OpenClaw 使用 `anthropic-messages` API 协议。

#### 3.2 Qwen Cloud 完整套餐 (`qwen`)

ClawDock 当前仅有 `modelstudio`（对应 Qwen Coding Plan Global）。缺失：

| 套餐 | 端点 | ClawDock ID 建议 | 说明 |
|------|------|-----------------|------|
| Coding Plan Global | `coding-intl.dashscope.aliyuncs.com/v1` | `qwen-coding-global` | 已部分覆盖（modelstudio） |
| Coding Plan CN | `coding.dashscope.aliyuncs.com/v1` | `qwen-coding-cn` | 国内编程订阅 |
| Standard Global | `dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-standard-global` | 国际按量付费 |
| Standard CN | `dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-standard-cn` | 国内按量付费 |

OpenClaw 模型列表：
- `qwen3.5-plus` (text+image, 1M context)
- `qwen3.6-plus` (text+image, 1M context, Global only)
- `qwen3-max-2026-01-23` (text, 262K)
- `qwen3-coder-next` (text, 262K)
- `qwen3-coder-plus` (text, 1M)
- `MiniMax-M2.5` (text, 1M, reasoning)
- `glm-5` (text, 202K)
- `glm-4.7` (text, 202K)
- `kimi-k2.5` (text+image, 262K)

#### 3.3 Z.AI / GLM (`zai`)

完全缺失。OpenClaw 支持 5 种认证方式：

| 方式 | 端点 | Choice ID |
|------|------|-----------|
| API Key | - | `zai-api-key` |
| Coding Plan Global | `api.z.ai` | `zai-coding-global` |
| Coding Plan CN | `open.bigmodel.cn` | `zai-coding-cn` |
| Global | `api.z.ai` | `zai-global` |
| CN | `open.bigmodel.cn` | `zai-cn` |

默认模型：`glm-5`

### P1 - 中优先级（国际主流 / 国内新兴）

#### 3.4 xAI / Grok (`xai`)

```typescript
{
  id: 'xai',
  name: 'xAI (Grok)',
  icon: 'X',
  placeholder: 'xai-...',
  model: 'Grok',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.x.ai/v1',
  defaultModelId: 'grok-4',
  category: 'official',
  envVar: 'XAI_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.x.ai/v1',
    api: 'openai-responses',
    apiKeyEnv: 'XAI_API_KEY',
    models: [
      { id: 'grok-4', name: 'Grok 4', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 64000 },
      { id: 'grok-4-fast', name: 'Grok 4 Fast', reasoning: true, input: ['text', 'image'], contextWindow: 2000000, maxTokens: 30000 },
      { id: 'grok-4.20-beta-latest-reasoning', name: 'Grok 4.20 Beta', reasoning: true, input: ['text', 'image'], contextWindow: 2000000, maxTokens: 30000 },
      { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 10000 }
    ]
  }
}
```

#### 3.5 Mistral AI (`mistral`)

```typescript
{
  id: 'mistral',
  name: 'Mistral AI',
  icon: '🌬️',
  placeholder: 'mistral-...',
  model: 'Mistral',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.mistral.ai/v1',
  defaultModelId: 'mistral-large-latest',
  category: 'official',
  envVar: 'MISTRAL_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.mistral.ai/v1',
    api: 'openai-completions',
    apiKeyEnv: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', reasoning: false, input: ['text', 'image'], contextWindow: 262144, maxTokens: 16384 },
      { id: 'mistral-small-latest', name: 'Mistral Small', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
      { id: 'codestral-latest', name: 'Codestral', reasoning: false, input: ['text'], contextWindow: 256000, maxTokens: 4096 },
      { id: 'devstral-medium-latest', name: 'Devstral 2', reasoning: false, input: ['text'], contextWindow: 262144, maxTokens: 32768 }
    ]
  }
}
```

#### 3.6 Groq (`groq`)

高速推理平台，支持多种开源模型。API 格式 OpenAI-compatible。

```typescript
{
  id: 'groq',
  name: 'Groq',
  icon: '⚡',
  placeholder: 'gsk_...',
  model: 'Multi-Model',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  category: 'compatible',
  envVar: 'GROQ_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.groq.com/openai/v1',
    api: 'openai-completions',
    apiKeyEnv: 'GROQ_API_KEY'
  }
}
```

#### 3.7 Together AI (`together`)

开源模型聚合平台。

```typescript
{
  id: 'together',
  name: 'Together AI',
  icon: '🤝',
  placeholder: 'together-...',
  model: 'Multi-Model',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.together.xyz/v1',
  category: 'compatible',
  envVar: 'TOGETHER_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.together.xyz/v1',
    api: 'openai-completions',
    apiKeyEnv: 'TOGETHER_API_KEY',
    models: [
      { id: 'zai-org/GLM-4.7', name: 'GLM 4.7 FP8', contextWindow: 202752 },
      { id: 'moonshotai/Kimi-K2.5', name: 'Kimi K2.5', contextWindow: 262144 },
      { id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', contextWindow: 131072 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', reasoning: true, contextWindow: 131072 }
    ]
  }
}
```

#### 3.8 Fireworks AI (`fireworks`)

```typescript
{
  id: 'fireworks',
  name: 'Fireworks AI',
  icon: '🎆',
  placeholder: 'fw-...',
  model: 'Multi-Model',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
  defaultModelId: 'accounts/fireworks/routers/kimi-k2p5-turbo',
  category: 'compatible',
  envVar: 'FIREWORKS_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    api: 'openai-completions',
    apiKeyEnv: 'FIREWORKS_API_KEY',
    models: [
      { id: 'accounts/fireworks/models/kimi-k2p6', name: 'Kimi K2.6', input: ['text', 'image'], contextWindow: 262144 },
      { id: 'accounts/fireworks/routers/kimi-k2p5-turbo', name: 'Kimi K2.5 Turbo', input: ['text', 'image'], contextWindow: 256000 }
    ]
  }
}
```

#### 3.9 Stepfun (阶跃星辰) (`stepfun`)

国内新兴大模型厂商。

```typescript
{
  id: 'stepfun',
  name: 'Stepfun',
  icon: '📶',
  placeholder: 'sk-...',
  model: 'Step',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.stepfun.com/v1',
  defaultModelId: 'step-3.5-flash',
  category: 'official',
  envVar: 'STEPFUN_API_KEY',
  supportedAuthModes: ['api_key'],
  defaultAuthMode: 'api_key',
  providerConfig: {
    baseUrl: 'https://api.stepfun.com/v1',
    api: 'openai-completions',
    apiKeyEnv: 'STEPFUN_API_KEY',
    models: [
      { id: 'step-3.5-flash', name: 'Step 3.5 Flash', reasoning: true, contextWindow: 262144, maxTokens: 65536 },
      { id: 'step-3.5-flash-2603', name: 'Step 3.5 Flash 2603', reasoning: true, contextWindow: 262144, maxTokens: 65536 }
    ]
  }
}
```

### P2 - 低优先级 / 特定场景

| Provider | 说明 | 场景 |
|----------|------|------|
| `nvidia` | NVIDIA NIM 推理平台 | 企业级部署 |
| `qianfan` | 百度千帆 | 国内合规 |
| `xiaomi` | 小米大模型 | 国内生态 |
| `byteplus` | BytePlus | 火山引擎国际版 |
| `tencent-tokenhub` | 腾讯 TokenHub | 腾讯生态 |
| `chutes` | Chutes | 开源模型 |
| `arcee` | Arcee AI | 企业模型 |
| `venice` | Venice AI | 隐私优先 |
| `kilocode` | Kilocode | 编程专用 |
| `synthetic` | Synthetic | 实验性 |
| `copilot-proxy` | Copilot Proxy | GitHub Copilot 代理 |
| `github-copilot` | GitHub Copilot | 官方 Copilot |
| `codex` | OpenAI Codex CLI | Codex 独立 CLI |
| `opencode` / `opencode-go` | Opencode | 编程助手 |
| `anthropic-vertex` | Anthropic Vertex | GCP 部署 |
| `huggingface` | HuggingFace | 开源生态 |
| `amazon-bedrock` | AWS Bedrock | AWS 生态 |
| `microsoft-foundry` | Microsoft Foundry | Azure 生态 |
| `cloudflare-ai-gateway` | Cloudflare | 网关代理 |
| `vercel-ai-gateway` | Vercel | 网关代理 |
| `litellm` | LiteLLM | 统一代理 |
| `vllm` / `sglang` / `lmstudio` | 本地推理 | 私有化部署 |

---

## 四、模型映射方案

### 4.1 当前 Provider ID 映射修复（必须）

在 `electron/utils/provider-keys.ts` 中补全反向映射：

```typescript
const OPENCLAW_PROVIDER_ID_MAP: Record<string, string> = {
  // ClawDock ID -> OpenClaw Provider ID (用于 auth-profiles 查找)
  'openai': 'openai-codex',
  'google': 'google-gemini-cli',
  'moonshot': 'moonshot',
  'moonshot-global': 'moonshot',
  'minimax-portal': 'minimax-portal',
  'minimax-portal-cn': 'minimax',
  'modelstudio': 'qwen',
  'ark': 'volcengine',
};
```

### 4.2 新增 Provider 的 OpenClaw 映射

| ClawDock ID | OpenClaw Provider ID | 说明 |
|-------------|---------------------|------|
| `kimi-coding` | `kimi-coding` | Kimi 编程订阅 |
| `qwen-coding-cn` | `qwen` | Qwen 国内编程 |
| `qwen-standard-global` | `qwen` | Qwen 国际按量 |
| `qwen-standard-cn` | `qwen` | Qwen 国内按量 |
| `zai` | `zai` | Z.AI / GLM |
| `xai` | `xai` | Grok |
| `groq` | `groq` | Groq |
| `mistral` | `mistral` | Mistral |
| `together` | `together` | Together |
| `fireworks` | `fireworks` | Fireworks |
| `stepfun` | `stepfun` | 阶跃星辰 |
| `stepfun-plan` | `stepfun-plan` | 阶跃编程 |
| `volcengine` | `volcengine` | 豆包 |
| `volcengine-plan` | `volcengine-plan` | 豆包编程 |

---

## 五、实施计划

### 阶段一：修复现有映射（1-2天）

1. 修复 `getOpenClawProviderKeyForType()` 的反向映射
2. 修复 `getProviderApiKeyFromOpenClaw()` 的 provider ID 查找
3. 验证 `moonshot`、`minimax`、`deepseek`、`openrouter`、`ollama` 的密钥读取
4. 验证 `anthropic`、`openai`、`google` 的密钥读取（核心修复）

### 阶段二：补齐国内主流 Provider（3-5天）

1. **Kimi Coding Plan** (`kimi-coding`)
2. **Qwen 完整套餐** (`qwen-coding-cn`, `qwen-standard-global`, `qwen-standard-cn`)
   - 重构 `modelstudio` 为 `qwen-coding-global`
   - 保留向后兼容
3. **Z.AI / GLM** (`zai`)
4. **Stepfun** (`stepfun`, `stepfun-plan`)
5. **Volcengine 完整套餐** (`volcengine`, `volcengine-plan`)
   - 与现有 `ark` 做映射对齐

### 阶段三：补齐国际主流 Provider（5-7天）

1. **xAI / Grok** (`xai`)
2. **Mistral** (`mistral`)
3. **Groq** (`groq`)
4. **Together** (`together`)
5. **Fireworks** (`fireworks`)

### 阶段四：补齐低优先级 Provider（按需）

根据用户反馈和社区需求逐步添加。

---

## 六、技术注意事项

### 6.1 多实例 Provider 的命名规则

OpenClaw 对多实例 provider 使用 `-cn`/`-global` 后缀（如 `moonshot` vs `moonshot-cn-api`）。
ClawDock 当前已使用 `moonshot`/`moonshot-global`、`minimax-portal`/`minimax-portal-cn` 的命名方式，应保持一致。

### 6.2 OAuth Provider 的特殊处理

MiniMax、OpenAI、Google 等支持 OAuth 的 provider，ClawDock 需要：
- 区分 OAuth 和 API Key 两种认证模式
- OAuth 模式下 `requiresApiKey = false`
- 提供 OAuth 登录流程

### 6.3 API 协议差异

| Provider | API 协议 | 备注 |
|----------|----------|------|
| 大多数 | `openai-completions` | 标准 OpenAI 格式 |
| `anthropic` | `anthropic-messages` | Claude 原生格式 |
| `kimi-coding` | `anthropic-messages` | 兼容 Claude 格式 |
| `minimax` | `anthropic-messages` | 兼容 Claude 格式 |
| `openai` | `openai-responses` | OpenAI Responses API |

### 6.4 环境变量命名

OpenClaw 的环境变量命名与 ClawDock 基本一致，但部分 provider 有多个备选变量：

```
Qwen: QWEN_API_KEY, MODELSTUDIO_API_KEY, DASHSCOPE_API_KEY
MiniMax: MINIMAX_CODE_PLAN_KEY, MINIMAX_CODING_API_KEY, MINIMAX_API_KEY
Z.AI: ZAI_API_KEY, Z_AI_API_KEY
Kimi: KIMI_API_KEY, KIMICODE_API_KEY
```

---

## 七、总结

当前 ClawDock 与 OpenClaw 的 Provider 对齐度约为 **26%**（14/54）。主要缺失集中在：

1. **国内厂商完整套餐**（Qwen、MiniMax OAuth、Z.AI、Stepfun、Volcengine）
2. **国际主流模型**（xAI/Grok、Mistral、Groq、Together、Fireworks）
3. **企业/云厂商集成**（AWS、Azure、GCP、NVIDIA）

建议按 **阶段一 → 阶段二 → 阶段三** 的顺序实施，优先修复现有 provider 的密钥读取问题，再补齐国内主流 provider，最后扩展国际 provider。
