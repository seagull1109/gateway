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

// ── chat（默认）────────────────────────────────────────────────────────
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

// ── auto/fast：高频翻译专用，loadbalance 均衡分流 ─────────────────────
// 改用 loadbalance 而非 fallback，让流量按权重分散到多个 provider，
// 避免把 Groq 30 RPM 瞬间打满——Groq(50%) + SiliconFlow(30%) + GLM(20%)
// 三个 provider 同时接流量，等效 RPM 上限大幅提升。
// DeepSeek 付费作为 fallback 兜底，保证翻译永不中断。
export function fastConfig(env: Env) {
  return {
    strategy: { mode: 'loadbalance' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        weight: 50,
        override_params: { model: 'openai/gpt-oss-20b' },
      },
      {
        // SiliconFlow：国内延迟低，DeepSeek V3 免费，权重 30%
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY,
        weight: 30,
        override_params: { model: 'deepseek-ai/DeepSeek-V3' },
      },
      {
        // GLM-4-Flash：永久免费无上限，国内访问最快，权重 20%
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        weight: 20,
        override_params: { model: 'glm-4-flash' },
      },
      {
        // DeepSeek 付费：三个都限速时的最终兜底
        provider: 'deepseek',
        api_key: env.DP_KEY,
        weight: 0,
        override_params: { model: 'deepseek-v4-flash' },
      },
    ],
  }
}

// ── auto/cheap：免费优先，加入 Mistral 和 GLM ─────────────────────────
// Mistral 每月 1B token 免费，GLM-4-Flash 永久免费无上限，
// 两者加进来让免费额度大幅提升。
export function cheapConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // GLM-4-Flash：永久免费无上限，中文表现好，放第一
        provider: 'zhipu',
        api_key: env.GLM_KEY,
        override_params: { model: 'glm-4-flash' },
      },
      {
        // Mistral：每月 1B token 免费，欧洲 provider，多样性好
        provider: 'mistral-ai',
        api_key: env.MISTRAL_KEY,
        override_params: { model: 'mistral-small-latest' },
      },
      {
        // SiliconFlow DeepSeek V3：免费层
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
        override_params: { model: 'meta-llama/llama-3.3-70b-instruct:free' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free' },
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
    strategy: { mode: 'fallback' },
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
        override_params: { model: 'qwen/qwen3-coder:free' },
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

// ── auto/image ────────────────────────────────────────────────────────
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
    case 'auto/coding': return codeConfig(env)
    case 'auto/fast':   return fastConfig(env)
    case 'auto/cheap':  return cheapConfig(env)
    case 'auto/image':  return imageConfig(env)
    default:            return chatConfig(env)
  }
}
