export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | 'auto/image'
  | 'auto/reasoning'
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
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'deepseek-ai/DeepSeek-V3' },
      },
      {
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
// 改动：去掉 meta-llama:free（已下线），加 openrouter/free 自动路由兜底
// openrouter/free 会自动从当前可用的免费模型里选，不需要维护具体模型名
export function cheapConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        override_params: { model: 'glm-4-flash' },
      },
      {
        provider: 'mistral-ai',
        api_key: env.MISTRAL_KEY,
        override_params: { model: 'mistral-small-latest' },
      },
      {
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'deepseek-ai/DeepSeek-V3' },
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
        // 自动路由兜底：OpenRouter 自动从当前可用免费模型里选，
        // 不需要追着模型名单变动
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

// ── auto/coding：代码专用 ────────────────────────────────────────────
// 改动：去掉 qwen/qwen3-coder:free（OpenRouter 已下线），
// 保留 Groq Qwen Coder（仍然可用）+ openrouter/free 兜底
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
        // openrouter/free 自动路由，避免硬编码已下线模型
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

// ── auto/reasoning：推理/分析/数学专用 ───────────────────────────────
// 新增：走 DeepSeek-R1 系列，专为需要深度推理的任务设计
// Groq R1 蒸馏版（速度快）→ OpenRouter R1 免费版 → DeepSeek R1 付费版 → Gemini
export function reasoningConfig(env: Env) {
  return {
    strategy: fallbackStrategy(),
    retry: RETRY,
    targets: [
      {
        // Groq DeepSeek-R1 蒸馏版：R1 推理能力 + LPU 加速，最快
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'deepseek-r1-distill-llama-70b' },
      },
      {
        // SiliconFlow DeepSeek-R1：国内访问快，免费层
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        override_params: { model: 'deepseek-ai/DeepSeek-R1' },
      },
      {
        // OpenRouter 自动路由：兜底
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openrouter/free' },
      },
      {
        // DeepSeek Reasoner：付费，推理能力最强
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-reasoner' },
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

export function getAliasConfig(alias: ModelAlias, env: Env) {
  switch (alias) {
    case 'auto/coding':    return codeConfig(env)
    case 'auto/fast':      return fastConfig(env)
    case 'auto/cheap':     return cheapConfig(env)
    case 'auto/search':    return searchConfig(env)
    case 'auto/image':     return imageConfig(env)
    case 'auto/reasoning': return reasoningConfig(env)
    default:               return chatConfig(env)
  }
}
