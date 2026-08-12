// src/core/modelTarget.ts

export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | 'auto/image'
  | null

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
// Retry
//
// 这些属于「临时性故障」：
// 429  = Rate Limit
// 500  = Provider Internal Error
// 502  = Bad Gateway
// 503  = Service Unavailable
// 504  = Gateway Timeout
//
// attempts = 1：
// 第一次失败后再尝试一次。
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
// Fallback
//
// 这些状态说明当前 Provider 暂时/明确不可用：
//
// 401 = Unauthorized
// 403 = Forbidden
// 408 = Request Timeout
// 429 = Rate Limit
// 500 = Internal Server Error
// 502 = Bad Gateway
// 503 = Service Unavailable
// 504 = Gateway Timeout
//
// 注意：
// 400 / 422 不放这里。
// 因为这类错误很可能是客户端请求、messages、tool schema
// 或参数本身有问题，盲目切换 Provider 可能掩盖真正问题。
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

// ============================================================
// 通用 Strategy
// ============================================================

function fallbackStrategy() {
  return {
    mode: 'fallback',

    on_status_codes: FALLBACK_STATUS_CODES,
  }
}

// ============================================================
// 根据客户端传入的 model 判断是否为 Gateway 模型别名
//
// Gateway 不根据用户消息内容判断意图。
// 路由完全由客户端通过 model 决定。
// ============================================================

export function detectModelAlias(
  model: string,
): ModelAlias {
  if (!model) return null

  const m = model
    .toLowerCase()
    .trim()

  if (
    m === 'auto/coding' ||
    m === 'coding'
  ) {
    return 'auto/coding'
  }

  if (
    m === 'auto/fast' ||
    m === 'fast'
  ) {
    return 'auto/fast'
  }

  if (
    m === 'auto/cheap' ||
    m === 'cheap'
  ) {
    return 'auto/cheap'
  }

  if (
    m === 'auto/search' ||
    m === 'search'
  ) {
    return 'auto/search'
  }

  if (
    m === 'auto/image' ||
    m === 'image'
  ) {
    return 'auto/image'
  }

  return null
}

// ============================================================
// 默认 Chat
//
// 普通聊天：
// Groq
//   ↓
// OpenRouter
//   ↓
// Gemini
//   ↓
// DeepSeek
// ============================================================

export function chatConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openai/gpt-oss-20b:free',
        },
      },

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

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
// auto/fast
//
// 目标：
// 高速度 + 稳定性
//
// Groq
//   ↓
// SiliconFlow
//   ↓
// Zhipu
//
// 不使用 loadbalance。
// Agent / Tool Calling 场景下，fallback 比随机负载均衡更稳定。
// ============================================================

export function fastConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-20b',
        },
      },

      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,

        override_params: {
          model: 'deepseek-ai/DeepSeek-V3',
        },
      },

      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,

        override_params: {
          model: 'glm-4-flash',
        },
      },
    ],
  }
}

// ============================================================
// auto/cheap
//
// 目标：
// 尽量低成本
//
// GLM
//   ↓
// Mistral
//   ↓
// SiliconFlow
//   ↓
// OpenRouter GPT-OSS Free
//   ↓
// OpenRouter Llama Free
//   ↓
// OpenRouter Nemotron Free
//   ↓
// Gemini
// ============================================================

export function cheapConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,

        override_params: {
          model: 'glm-4-flash',
        },
      },

      {
        provider: 'mistral-ai',
        api_key: env.MISTRAL_KEY,

        override_params: {
          model: 'mistral-small-latest',
        },
      },

      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,

        override_params: {
          model: 'deepseek-ai/DeepSeek-V3',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'openai/gpt-oss-20b:free',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'meta-llama/llama-3.3-70b-instruct:free',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model:
            'nvidia/llama-3.3-nemotron-super-49b-v1:free',
        },
      },

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
// auto/search
//
// 注意：
// Gateway 这里只负责模型路由。
// 不在这里实现 Tavily / Gemini Search / MCP。
// ============================================================

export function searchConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

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
// auto/coding
//
// 目标：
// 编程能力优先，同时保证 Provider 故障时可以自动降级。
//
// Groq Qwen Coder
//   ↓
// Groq GPT-OSS-120B
//   ↓
// OpenRouter Qwen3-Coder
//   ↓
// DeepSeek
//   ↓
// Gemini
// ============================================================

export function codeConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'qwen-2.5-coder-32b',
        },
      },

      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'qwen/qwen3-coder:free',
        },
      },

      {
        provider: 'deepseek',
        api_key: env.DP_KEY,

        override_params: {
          model: 'deepseek-v4-flash',
        },
      },

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
// auto/image
//
// 注意：
// 这里仍然保持你的原设计。
// 如果以后你确定需要真正的图片生成 / Vision 路由，
// 建议再单独拆成 image-understanding / image-generation。
// ============================================================

export function imageConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),

    retry: RETRY,

    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,

        override_params: {
          model: 'gemini-2.5-flash-lite',
        },
      },

      {
        provider: 'groq',
        api_key: env.GROQ,

        override_params: {
          model: 'openai/gpt-oss-120b',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,

        override_params: {
          model: 'nvidia/nemotron-nano-12b-vl:free',
        },
      },

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
// 根据 alias 获取配置
// ============================================================

export function getAliasConfig(
  alias: ModelAlias,
  env: Env,
) {
  switch (alias) {
    case 'auto/coding':
      return codeConfig(env)

    case 'auto/fast':
      return fastConfig(env)

    case 'auto/cheap':
      return cheapConfig(env)

    case 'auto/search':
      return searchConfig(env)

    case 'auto/image':
      return imageConfig(env)

    default:
      return chatConfig(env)
  }
}