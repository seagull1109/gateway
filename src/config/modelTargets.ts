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
  [key: string]: string
}

export function detectModelAlias(model: string): ModelAlias {
  if (!model) return null
  const m = model.toLowerCase()
  if (m === 'auto/coding' || m === 'coding') return 'auto/coding'
  if (m === 'auto/fast'   || m === 'fast')   return 'auto/fast'
  if (m === 'auto/cheap'  || m === 'cheap')  return 'auto/cheap'
  if (m === 'auto/search' || m === 'search') return 'auto/search'
  if (m === 'auto/image'  || m === 'image')  return 'auto/image'
  return null
}

// ── chat（默认，无别名时走这条）─────────────────────────────────────
export function chatConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'qwen/qwen3.6-27b' },
      },
      {
        // OpenRouter 上的 gpt-oss-20b 免费版
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

// ── auto/fast：速度优先 ───────────────────────────────────────────────
export function fastConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // gpt-oss-20b：Groq 上最快的轻量模型
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-20b' },
      },
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/cheap：免费优先（只走确认可用的 :free 模型）─────────────────
// 注意：DeepSeek:free 和 Gemini:free 在 OpenRouter 上 2026年7月已下线
// 目前确认可用的免费模型：gpt-oss-20b、llama-3.3-70b、nemotron-3-ultra
export function cheapConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // OpenAI gpt-oss-20b 免费版：coding 性能最强的免费模型
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'openai/gpt-oss-20b:free' },
      },
      {
        // Llama 3.3 70B：最稳定的免费通用模型
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'meta-llama/llama-3.3-70b-instruct:free' },
      },
      {
        // NVIDIA Nemotron 3 Ultra 550B MoE：免费旗舰，上下文 1M
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free' },
      },
      {
        // Google Gemini 免费层兜底
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/coding：代码专用 ────────────────────────────────────────────
export function codeConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // Groq Qwen2.5 Coder：代码专用 + LPU 加速
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'qwen-2.5-coder-32b' },
      },
      {
        // Groq gpt-oss-120b：通用大模型，代码能力也强
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-120b' },
      },
      {
        // OpenRouter Qwen3 Coder 免费版：1M 上下文，目前最强免费 coding 模型
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'qwen/qwen3-coder:free' },
      },
      {
        // OpenRouter gpt-oss-20b 免费版：备用
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

// ── auto/image：图片理解/多模态输入 ──────────────────────────────────
// 注意：Groq llama-4-maverick 已废弃，改用 qwen3.6-27b（vision preview）
// OpenRouter 上免费视觉模型：nemotron-nano-12b-vl:free
export function imageConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // Gemini：多模态最稳定，免费层
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        // Groq qwen3.6-27b：支持图片输入（vision preview）
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'qwen/qwen3.6-27b' },
      },
      {
        // OpenRouter 免费视觉模型
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/nemotron-nano-12b-vl:free' },
      },
      {
        // Gemini Pro：付费兜底，视觉能力最强
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash' },
      },
    ],
  }
}

export function getAliasConfig(alias: ModelAlias, env: Env) {
  switch (alias) {
    case 'auto/coding': return codeConfig(env)
    case 'auto/fast':   return fastConfig(env)
    case 'auto/cheap':  return cheapConfig(env)
    case 'auto/image':  return imageConfig(env)
    default:            return chatConfig(env)
  }
}
