```typescript
// ============================================================
// modelTargets.ts
//
// Gateway 虚拟模型：
//
//   astrbot    → AstrBot 专用 Gemini 模型池
//   fast       → 快速模型池
//   cheap      → 低成本 / 免费模型池
//   coding     → 编程模型池
//   search     → 搜索模型池
//   image      → 多模态模型池
//   reasoning  → 推理模型池
//
// 客户端只需要传：
//   model: "astrbot"
//   model: "fast"
//   model: "cheap"
//   ...
//
// 不再使用 auto/ 前缀。
// ============================================================


// ============================================================
// Model Alias
// ============================================================

export type ModelAlias =
  | 'astrbot'
  | 'fast'
  | 'cheap'
  | 'coding'
  | 'search'
  | 'image'
  | 'reasoning'
  | null


// ============================================================
// Retry
//
// 单个 target 自己重试 1 次。
// 如果仍然失败，由 fallback 继续尝试下一个 target。
//
// 注意：
// retry 和 fallback 是两层机制：
//
// target A
//   ↓
// retry
//   ↓
// 仍失败
//   ↓
// fallback
//   ↓
// target B
// ============================================================

const RETRY = {
  attempts: 1,

  on_status_codes: [
    429,
    500,
    502,
    503,
    504,
  ],
}


// ============================================================
// Fallback Failure Status
//
// 这些 HTTP 状态码出现时，允许 Portkey 放弃当前 target
// 并继续尝试下一个 target。
//
// 401 → API Key / 鉴权问题
// 403 → Forbidden / Provider 拒绝
// 408 → Request Timeout
// 429 → Rate Limit
// 500 → Provider 内部错误
// 502 → Bad Gateway
// 503 → Service Unavailable
// 504 → Gateway Timeout
// ============================================================

const FALLBACK_STATUS_CODES = [
  401,
  403,
  408,
  429,
  500,
  502,
  503,
  504,
]


function fallbackStrategy() {
  return {
    mode: 'fallback',

    on_status_codes: FALLBACK_STATUS_CODES,
  }
}


// ============================================================
// Environment
// ============================================================

interface Env {
  GROQ: string

  GEMINI_KEY: string

  OPENROUTER_KEY: string

  DP_KEY: string

  SILICONFLOW_KEY: string

  GLM_KEY: string

  MISTRAL_KEY: string

  [key: string]: string
}


// ============================================================
// Model Alias Detection
//
// 客户端：
//
//   model = "astrbot"
//   model = "fast"
//   model = "cheap"
//   model = "coding"
//   model = "search"
//   model = "image"
//   model = "reasoning"
//
// Gateway 根据 model 选择对应模型池。
// ============================================================

export function detectModelAlias(model: string): ModelAlias {
  if (!model) {
    return null
  }

  const m = model.toLowerCase().trim()

  if (m === 'astrbot') {
    return 'astrbot'
  }

  if (m === 'fast') {
    return 'fast'
  }

  if (m === 'cheap') {
    return 'cheap'
  }

  if (m === 'coding') {
    return 'coding'
  }

  if (m === 'search') {
    return 'search'
  }

  if (m === 'image') {
    return 'image'
  }

  if (m === 'reasoning') {
    return 'reasoning'
  }

  return null
}


// ============================================================
// 默认 Chat
//
// 普通客户端没有使用上述虚拟模型时，走这里。
// ============================================================

export function chatConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Groq
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },

      // ② OpenRouter
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openai/gpt-oss-20b:free',
        },
      },

      // ③ Gemini
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

      // ④ DeepSeek
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,

        override_params: {
          model: 'deepseek-v4-flash',
        },
      },
    ],
  }
}


// ============================================================
// fast
//
// 目标：
// 高频聊天
// 翻译
// 简单问答
// 速度优先
//
// 策略：Fallback
// ============================================================

export function fastConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Groq
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-20b',
        },
      },

      // ② SiliconFlow
      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,

        override_params: {
          model: 'Qwen/Qwen3-8B',
        },
      },

      // ③ GLM
      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,

        override_params: {
          model: 'glm-4-flash',
        },
      },

      // ④ DeepSeek
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,

        override_params: {
          model: 'deepseek-v4-flash',
        },
      },
    ],
  }
}


// ============================================================
// cheap
//
// 目标：
// 免费 / 低成本优先
//
// 顺序：
// GLM
//   ↓
// Mistral
//   ↓
// SiliconFlow
//   ↓
// OpenRouter Free
//   ↓
// OpenRouter Free 备用
//   ↓
// OpenRouter 自动免费路由
//   ↓
// Gemini
// ============================================================

export function cheapConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① GLM
      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,

        override_params: {
          model: 'glm-4-flash',
        },
      },

      // ② Mistral
      {
        provider: 'mistral-ai',
        api_key: env.MISTRAL_KEY,

        override_params: {
          model: 'mistral-small-latest',
        },
      },

      // ③ SiliconFlow
      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,

        override_params: {
          model: 'Qwen/Qwen3-8B',
        },
      },

      // ④ OpenRouter GPT-OSS Free
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openai/gpt-oss-20b:free',
        },
      },

      // ⑤ OpenRouter Nemotron Free
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model:
            'nvidia/llama-3.3-nemotron-super-49b-v1:free',
        },
      },

      // ⑥ OpenRouter Free 自动路由
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openrouter/free',
        },
      },

      // ⑦ Gemini
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },
    ],
  }
}


// ============================================================
// coding
//
// 目标：
// Coding / Programming / Code Agent
//
// Groq 优先
// OpenRouter / DeepSeek 兜底
// ============================================================

export function codeConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Groq Qwen Coder
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'qwen-2.5-coder-32b',
        },
      },

      // ② Groq GPT-OSS
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },

      // ③ OpenRouter Free
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openrouter/free',
        },
      },

      // ④ DeepSeek
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,

        override_params: {
          model: 'deepseek-v4-flash',
        },
      },

      // ⑤ Gemini
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },
    ],
  }
}


// ============================================================
// reasoning
//
// 目标：
// 深度思考
// 复杂任务
// Agent
// ============================================================

export function reasoningConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Groq R1 Distill
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'deepseek-r1-distill-llama-70b',
        },
      },

      // ② SiliconFlow R1 Distill
      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,

        override_params: {
          model:
            'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
        },
      },

      // ③ OpenRouter Free
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openrouter/free',
        },
      },

      // ④ DeepSeek
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,

        override_params: {
          model: 'deepseek-v4-flash',
        },
      },

      // ⑤ Gemini
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash',
        },
      },
    ],
  }
}


// ============================================================
// search
//
// 注意：
//
// 这里仍然只是“模型路由”。
// Gateway 不负责实现搜索业务逻辑。
//
// 如果 AstrBot / Agent 本身提供搜索 Tool，
// Tool Calling 仍然由客户端 Agent 负责。
// ============================================================

export function searchConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Gemini
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

      // ② OpenRouter
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openai/gpt-oss-20b:free',
        },
      },
    ],
  }
}


// ============================================================
// image
//
// 目标：
// 图片理解
// 多模态
//
// Gemini 优先。
// ============================================================

export function imageConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ① Gemini Flash-Lite
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

      // ② Gemini Flash
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash',
        },
      },

      // ③ OpenRouter VL
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'nvidia/nemotron-nano-12b-vl:free',
        },
      },

      // ④ Groq
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },
    ],
  }
}


// ============================================================
// astrbot
//
// ============================================================
//
// AstrBot 专用 Gemini 模型池。
//
// 特点：
//
// 1. 只使用 Google Gemini
// 2. 不混入 Groq
// 3. 不混入 OpenRouter
// 4. 不混入 DeepSeek
// 5. 重点保证 Tool Calling / Agent / 多模态
// 6. Portkey 负责 Retry + Fallback
//
// AstrBot 客户端只需要：
//
//     model = "astrbot"
//
// 后面 Gemini 模型怎么调整，AstrBot 不需要修改。
// ============================================================

export function astrbotConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [

      // ========================================================
      // ① Gemini 3.6 Flash
      //
      // 主力模型
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-3.6-flash',
        },
      },

      // ========================================================
      // ② Gemini 3.5 Flash
      //
      // 主力备用
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-3.5-flash',
        },
      },

      // ========================================================
      // ③ Gemini 3.5 Flash-Lite
      //
      // 高频 / 高吞吐
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-3.5-flash-lite',
        },
      },

      // ========================================================
      // ④ Gemini 3.1 Flash-Lite
      //
      // 轻量备用
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-3.1-flash-lite',
        },
      },

      // ========================================================
      // ⑤ Gemini 2.5 Flash
      //
      // 稳定兜底
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash',
        },
      },

      // ========================================================
      // ⑥ Gemini 2.5 Flash-Lite
      //
      // 低成本 / 高吞吐兜底
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

      // ========================================================
      // ⑦ Gemini 2.5 Pro
      //
      // 最终高质量兜底
      // ========================================================

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-pro',
        },
      },
    ],
  }
}


// ============================================================
// Alias → Config
// ============================================================

export function getAliasConfig(
  alias: ModelAlias,
  env: Env,
) {
  switch (alias) {

    case 'astrbot':
      return astrbotConfig(env)

    case 'fast':
      return fastConfig(env)

    case 'cheap':
      return cheapConfig(env)

    case 'coding':
      return codeConfig(env)

    case 'search':
      return searchConfig(env)

    case 'image':
      return imageConfig(env)

    case 'reasoning':
      return reasoningConfig(env)

    default:
      return chatConfig(env)
  }
}
```
