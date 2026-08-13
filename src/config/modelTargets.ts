export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | 'auto/image'
  | 'auto/reasoning'
  | 'auto/astrbot'
  | null

const RETRY = {
  attempts: 1,
  on_status_codes: [429, 500, 502, 503, 504],
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
  GEMINI_KEY_ASTRBOT: string // AstrBot 专用，独立配额，不与其他 alias 共用
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
  if (m === 'auto/coding'    || m === 'coding')    return 'auto/coding'
  if (m === 'auto/fast'      || m === 'fast')      return 'auto/fast'
  if (m === 'auto/cheap'     || m === 'cheap')     return 'auto/cheap'
  if (m === 'auto/search'    || m === 'search')    return 'auto/search'
  if (m === 'auto/image'     || m === 'image')     return 'auto/image'
  if (m === 'auto/reasoning' || m === 'reasoning') return 'auto/reasoning'
  if (m === 'auto/astrbot'   || m === 'astrbot')   return 'auto/astrbot'
  return null
}

// ── chat（默认）────────────────────────────────────────────────────────
export function chatConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openai/gpt-oss-20b:free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-v4-flash' },
      },
    ],
  }
}

// ── auto/fast：高频翻译/速度优先 ──────────────────────────────────────
// SiliconFlow 换成永久免费的 Qwen3-8B，避免余额不足报 402
// 付费的 DeepSeek-V3 改由 deepseek provider 做最终兜底
export function fastConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-20b' },
      },
      {
        // SiliconFlow 永久免费模型，30 RPM，国内延迟低
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'Qwen/Qwen3-8B' },
      },
      {
        // GLM-4-Flash：永久免费无上限
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        override_params: { model: 'glm-4-flash' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-v4-flash' },
      },
    ],
  }
}

// ── auto/cheap：免费优先 ──────────────────────────────────────────────
export function cheapConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        // GLM-4-Flash：永久免费无上限
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        override_params: { model: 'glm-4-flash' },
      },
      {
        // Mistral：每月 1B token 免费
        provider: 'mistral-ai',
        api_key: env.MISTRAL_KEY,
        override_params: { model: 'mistral-small-latest' },
      },
      {
        // SiliconFlow 永久免费
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'Qwen/Qwen3-8B' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openai/gpt-oss-20b:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free' },
      },
      {
        // OpenRouter 自动路由：从当前可用免费模型里选
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openrouter/free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/coding ───────────────────────────────────────────────────────
export function codeConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'qwen-2.5-coder-32b' },
      },
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openrouter/free' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-v4-flash' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/reasoning ────────────────────────────────────────────────────
// SiliconFlow 换成永久免费的 R1 蒸馏版
export function reasoningConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        // Groq R1 蒸馏版：速度最快
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'deepseek-r1-distill-llama-70b' },
      },
      {
        // SiliconFlow 永久免费 R1 蒸馏版，国内延迟低
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openrouter/free' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-v4-flash' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash' },
      },
    ],
  }
}

// ── auto/search ───────────────────────────────────────────────────────
export function searchConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openai/gpt-oss-20b:free' },
      },
    ],
  }
}

// ── auto/image ────────────────────────────────────────────────────────
export function imageConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/nemotron-nano-12b-vl:free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash' },
      },
    ],
  }
}

// ── auto/astrbot：AstrBot 专用 Gemini 池 ─────────────────────────────
// 只用 Gemini，不混其他 provider（tool calling 多轮场景要稳定优先）
// 用独立的 GEMINI_KEY_ASTRBOT，配额与其他 alias 隔离
// 注意：这是新申请的 key/项目，Google 现在不允许新 key 访问 2.5 系列模型
// （2.5-flash / 2.5-flash-lite / 2.5-pro 对新 key 一律 404），必须用 3.x 系列
// 3.6 Flash / 3.5 Flash-Lite 已废弃 temperature/top_p/top_k 采样参数，
// 如果 AstrBot 请求带这几个字段导致 400，需要在 Gateway 层做参数清理
export function astrbotConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: { model: 'gemini-3.6-flash' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: { model: 'gemini-3.5-flash' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY_ASTRBOT,
        override_params: { model: 'gemini-3.1-flash-lite' },
      },
    ],
  }
}

export function getAliasConfig(alias: ModelAlias, env: Env) {
  switch (alias) {
    case 'auto/coding':    return codeConfig(env)
    case 'auto/fast':      return fastConfig(env)
    case 'auto/cheap':     return cheapConfig(env)
    case 'auto/search':    return searchConfig(env)
    case 'auto/image':     return imageConfig(env)
    case 'auto/reasoning': return reasoningConfig(env)
    case 'auto/astrbot':   return astrbotConfig(env)
    default:               return chatConfig(env)
  }
}