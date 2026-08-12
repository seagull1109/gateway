export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | 'auto/image'
  | null

const RETRY = {
  attempts: 1,
  on_status_codes: [429, 500, 502, 503, 504],
}

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

/**
 * 根据客户端传入的 model 判断是否为 Gateway 模型别名。
 *
 * Gateway 不再根据用户消息内容判断意图。
 * 路由完全由客户端通过 model 决定。
 */
export function detectModelAlias(model: string): ModelAlias {
  if (!model) return null

  const m = model.toLowerCase().trim()

  if (m === 'auto/coding' || m === 'coding') {
    return 'auto/coding'
  }

  if (m === 'auto/fast' || m === 'fast') {
    return 'auto/fast'
  }

  if (m === 'auto/cheap' || m === 'cheap') {
    return 'auto/cheap'
  }

  if (m === 'auto/search' || m === 'search') {
    return 'auto/search'
  }

  if (m === 'auto/image' || m === 'image') {
    return 'auto/image'
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// 默认 chat
// ─────────────────────────────────────────────────────────────

export function chatConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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

// ─────────────────────────────────────────────────────────────
// auto/fast
// ─────────────────────────────────────────────────────────────

export function fastConfig(env: Env) {
  return {
    strategy: { mode: 'loadbalance' },
    retry: RETRY,

    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        weight: 50,
        override_params: {
          model: 'openai/gpt-oss-20b',
        },
      },

      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        weight: 30,
        override_params: {
          model: 'deepseek-ai/DeepSeek-V3',
        },
      },

      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        weight: 20,
        override_params: {
          model: 'glm-4-flash',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// auto/cheap
// ─────────────────────────────────────────────────────────────

export function cheapConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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

// ─────────────────────────────────────────────────────────────
// auto/search
//
// 注意：这里仍然只是模型路由。
// 不在 Gateway 中实现 geminiSearch / Tavily / 搜索业务逻辑。
// ─────────────────────────────────────────────────────────────

export function searchConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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

// ─────────────────────────────────────────────────────────────
// auto/coding
// ─────────────────────────────────────────────────────────────

export function codeConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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

// ─────────────────────────────────────────────────────────────
// auto/image
// ─────────────────────────────────────────────────────────────

export function imageConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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

// ─────────────────────────────────────────────────────────────
// 根据 alias 获取配置
// ─────────────────────────────────────────────────────────────

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