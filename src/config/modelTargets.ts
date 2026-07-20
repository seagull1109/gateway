export type Intent = 'chat' | 'reasoning' | 'code' | 'image'

export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
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
  [key: string]: string
}

export function detectModelAlias(model: string): ModelAlias {
  if (!model) return null
  const m = model.toLowerCase()
  if (m === 'auto/coding' || m === 'coding') return 'auto/coding'
  if (m === 'auto/fast'   || m === 'fast')   return 'auto/fast'
  if (m === 'auto/cheap'  || m === 'cheap')  return 'auto/cheap'
  if (m === 'auto/search' || m === 'search') return 'auto/search'
  return null
}

// ── chat ──────────────────────────────────────────────────────────────
// Groq 最快，OpenRouter 免费模型备用，Gemini 稳定兜底，DeepSeek 付费最终兜底
export function chatConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'llama-3.3-70b-versatile' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'meta-llama/llama-3.3-70b-instruct:free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-chat' },
      },
    ],
  }
}

// ── auto/fast：速度优先 ───────────────────────────────────────────────
export function fastConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'llama-3.3-70b-versatile' },
      },
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'llama-3.1-8b-instant' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/cheap：免费优先 ──────────────────────────────────────────────
export function cheapConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'meta-llama/llama-3.3-70b-instruct:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'google/gemini-2.0-flash-exp:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'deepseek/deepseek-r1:free' },
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
// 代码专用模型链，通过 OpenRouter 调用 NIM 上的大模型
export function codeConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'qwen-2.5-coder-32b' },
      },
      {
        // OpenRouter 上的 NIM Qwen3 Coder（通过 OpenRouter 调，不需要 custom_host）
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'qwen/qwen3-coder-480b-a35b-instruct:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'qwen/qwen-2.5-coder-32b-instruct:free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-chat' },
      },
    ],
  }
}

// ── reasoning ─────────────────────────────────────────────────────────
export function reasoningConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'deepseek-r1-distill-llama-70b' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'deepseek/deepseek-r1:free' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash' },
      },
      {
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-reasoner' },
      },
    ],
  }
}

// ── image ─────────────────────────────────────────────────────────────
export function imageConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
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
        override_params: { model: 'google/gemini-2.0-flash-exp:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'meta-llama/llama-4-maverick:free' },
      },
    ],
  }
}

export function getIntentConfig(intent: Intent, env: Env) {
  switch (intent) {
    case 'reasoning': return reasoningConfig(env)
    case 'code':      return codeConfig(env)
    case 'image':     return imageConfig(env)
    default:          return chatConfig(env)
  }
}

export function getAliasConfig(alias: ModelAlias, env: Env) {
  switch (alias) {
    case 'auto/coding': return codeConfig(env)
    case 'auto/fast':   return fastConfig(env)
    case 'auto/cheap':  return cheapConfig(env)
    default:            return chatConfig(env)
  }
}
