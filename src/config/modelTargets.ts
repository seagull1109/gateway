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
  SILICONFLOW_KEY?: string
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

// ── auto/fast：专为高频翻译设计 ────────────────────────────────────────
// 核心问题：Groq 两条目标共享同一个账号 RPM（30/min），并发翻译很快打爆。
// 解法：
//   1. Groq 只放一条（节省 RPM，避免误以为有两倍容量）
//   2. 第二条换 SiliconFlow（国内访问快，DeepSeek V3 免费层）
//   3. Google 作为第三选择
//   4. DeepSeek 付费作为最终兜底，保证翻译永不报错
export function fastConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // Groq：最快，但 30 RPM 账号级限制，高并发容易触发
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'openai/gpt-oss-20b' },
      },
      {
        // SiliconFlow：国内访问延迟低，DeepSeek V3 免费层
        // 需要在 CF 里加 SILICONFLOW_KEY（去 siliconflow.cn 注册）
        provider: 'siliconflow',
        api_key: env.SILICONFLOW_KEY ?? '',
        override_params: { model: 'deepseek-ai/DeepSeek-V3' },
      },
      {
        // Gemini：15 RPM 偏低，但比直接报错强
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        // DeepSeek 付费：永不限速，保证翻译不中断
        provider: 'deepseek',
        api_key: env.DP_KEY,
        override_params: { model: 'deepseek-v4-flash' },
      },
    ],
  }
}

export function cheapConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
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
        override_params: { model: 'qwen/qwen3.6-27b' },
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
