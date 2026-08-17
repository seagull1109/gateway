export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | 'auto/image'
  | 'auto/reasoning'
  | 'auto/astrbot'
  | 'auto/free'
  | null

const RETRY = {
  attempts: 1,
  on_status_codes: [429, 500, 502, 503, 504],
  use_retry_after_headers: true,
}

const FALLBACK_STATUS_CODES = [401, 403, 408, 429, 500, 502, 503, 504]

function fallbackStrategy() {
  return {
    mode: 'fallback',
    on_status_codes: FALLBACK_STATUS_CODES,
  }
}

interface Env {
  GROQ: string
  GEMINI_KEY: string
  GEMINI_KEY_ASTRBOT: string
  OPENROUTER_KEY: string
  DP_KEY: string
  SILICONFLOW_KEY: string
  GLM_KEY: string
  MISTRAL_KEY: string
  [key: string]: string
}

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

  if (m === 'auto/reasoning' || m === 'reasoning') {
    return 'auto/reasoning'
  }

  if (m === 'auto/astrbot' || m === 'astrbot') {
    return 'auto/astrbot'
  }

  if (m === 'auto/free' || m === 'free') {
    return 'auto/free'
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// auto/fast：高频翻译 / 速度优先
// ─────────────────────────────────────────────────────────────

export function fastConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        // Hunyuan-MT-7B：SiliconFlow 上免费的翻译专用模型，优先试这个
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: {
          model: 'tencent/Hunyuan-MT-7B',
        },
      },

      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: {
          model: 'openai/gpt-oss-20b',
        },
      },

      {
        // SiliconFlow 免费模型
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: {
          model: 'Qwen/Qwen3-8B',
        },
      },

      {
        // GLM-4-Flash
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        override_params: {
          model: 'glm-4-flash',
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
// auto/cheap：免费优先
// ─────────────────────────────────────────────────────────────

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
          model: 'Qwen/Qwen3-8B',
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
          model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free',
        },
      },

      {
        // OpenRouter 免费自动路由
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: {
          model: 'openrouter/free',
        },
      },

      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: {
          model: 'gemini-3.1-flash-lite',
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
          model: 'openrouter/free',
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
          model: 'gemini-3.5-flash-lite',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// auto/reasoning
// ─────────────────────────────────────────────────────────────

export function reasoningConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        // Groq R1 蒸馏版
        provider: 'groq',
        api_key: env.GROQ,
        override_params: {
          model: 'deepseek-r1-distill-llama-70b',
        },
      },

      {
        // SiliconFlow R1 蒸馏版
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: {
          model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
        },
      },

      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: {
          model: 'openrouter/free',
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
          model: 'gemini-3.6-flash',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// auto/search
// ─────────────────────────────────────────────────────────────

export function searchConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: {
          model: 'gemini-3.1-flash-lite',
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
// auto/image
// ─────────────────────────────────────────────────────────────

export function imageConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: {
          model: 'gemini-3.5-flash-lite',
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
          model: 'gemini-3.6-flash',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// auto/astrbot：AstrBot 专用 Gemini 池
//
// 只使用 Gemini，不混其他 provider。
// 独立 GEMINI_KEY_ASTRBOT，和其他 alias 的 Gemini 配额隔离。
// ─────────────────────────────────────────────────────────────

export function astrbotConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: {
          model: 'gemini-3.5-flash-lite',
        },
      },

      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: {
          model: 'gemini-3.1-flash-lite',
        },
      },

      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: {
          model: 'gemini-3.6-flash',
        },
      },

      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: {
          model: 'gemini-3.5-flash',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// auto/free：OpenRouter 免费模型池，按指定优先级排列
//
// 前 4 个是 :free 免费端点，最后 2 个是同系列的付费端点，
// 免费额度耗尽/限流时才会兜到付费的，不是常态开销。
// ─────────────────────────────────────────────────────────────

export function freeConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,

    targets: [
      {
        // Dolphin-Mistral-24B Venice Edition（付费）
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: {
          model: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// 根据 alias 获取配置
// ─────────────────────────────────────────────────────────────

export function getAliasConfig(alias: ModelAlias, env: Env) {
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

    case 'auto/reasoning':
      return reasoningConfig(env)

    case 'auto/astrbot':
      return astrbotConfig(env)

    case 'auto/free':
      return freeConfig(env)

    default:
      return fastConfig(env)
  }
}