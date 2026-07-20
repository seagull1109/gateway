// src/config/modelTargets.ts
//
// 模型别名系统（参考 OmniRoute 的 auto/* 设计）：
//   auto/coding  → 代码专用链（Groq Qwen Coder → NIM Qwen3 480B → ...）
//   auto/fast    → 速度优先链（Groq → Cerebras，只用延迟最低的两个）
//   auto/cheap   → 免费优先链（只走 :free 模型）
//   auto/search  → 直接走 Gemini Google Search（绕开 Portkey）
//   其他任意值   → 走意图分类器决定

export type Intent = 'chat' | 'reasoning' | 'code' | 'image'

export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | null

const NIM_HOST = 'https://integrate.api.nvidia.com/v1'
const CEREBRAS_HOST = 'https://api.cerebras.ai/v1'

const RETRY = {
  attempts: 1,
  on_status_codes: [429, 500, 502, 503, 504],
}

interface Env {
  GROQ: string
  CEREBRAS_KEY: string
  NVIDIA_NIM_KEY: string
  GEMINI_KEY: string
  OPENROUTER_KEY: string
  DP_KEY: string
  [key: string]: string
}

// 识别模型别名，返回对应的 ModelAlias，识别不到返回 null
export function detectModelAlias(model: string): ModelAlias {
  if (!model) return null
  const m = model.toLowerCase()
  if (m === 'auto/coding' || m === 'coding') return 'auto/coding'
  if (m === 'auto/fast' || m === 'fast') return 'auto/fast'
  if (m === 'auto/cheap' || m === 'cheap') return 'auto/cheap'
  if (m === 'auto/search' || m === 'search') return 'auto/search'
  return null
}

// ── 分类器 ────────────────────────────────────────────────────────────
export function classifierConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        provider: 'groq',
        api_key: env.GROQ,
        override_params: { model: 'llama-3.1-8b-instant', max_tokens: 10, temperature: 0 },
      },
      {
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'meta/llama-3.1-8b-instruct', max_tokens: 10, temperature: 0 },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite', max_tokens: 10, temperature: 0 },
      },
    ],
  }
}

// ── chat（日常对话，含 Google Search grounding）────────────────────────
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
        provider: 'openai',
        api_key: env.CEREBRAS_KEY,
        custom_host: CEREBRAS_HOST,
        override_params: { model: 'gpt-oss-120b' },
      },
      {
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'meta/llama-3.3-70b-instruct' },
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

// ── auto/fast：速度优先，只用延迟最低的两个 provider ─────────────────
// Groq LPU 是最快的推理硬件，Cerebras 次之，两个都够快，
// 快到任何一个可用时用户几乎感受不到延迟。
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
        provider: 'openai',
        api_key: env.CEREBRAS_KEY,
        custom_host: CEREBRAS_HOST,
        override_params: { model: 'gpt-oss-120b' },
      },
      {
        // 两个都限速时才用 Google
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/cheap：免费优先，只走 :free 模型，不消耗任何付费额度 ──────────
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
        // Google 免费层：15 RPM，1500 RPD，算免费
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
    ],
  }
}

// ── auto/coding / code：代码专用链 ──────────────────────────────────
// 支持流式输出（Claude Code 需要），
// 模型顺序：代码专用模型 → 通用大模型兜底
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
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'qwen/qwen3-coder-480b-a35b-instruct' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'qwen/qwen-2.5-coder-32b-instruct:free' },
      },
      {
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'deepseek-ai/deepseek-coder-v2-instruct' },
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
        provider: 'openai',
        api_key: env.CEREBRAS_KEY,
        custom_host: CEREBRAS_HOST,
        override_params: { model: 'gpt-oss-120b' },
      },
      {
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'deepseek-ai/deepseek-r1' },
      },
      {
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash' },
      },
      {
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'deepseek/deepseek-r1:free' },
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
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'microsoft/phi-4-multimodal-instruct' },
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

// 根据意图返回对应 config
export function getIntentConfig(intent: Intent, env: Env) {
  switch (intent) {
    case 'reasoning': return reasoningConfig(env)
    case 'code':      return codeConfig(env)
    case 'image':     return imageConfig(env)
    default:          return chatConfig(env)
  }
}

// 根据模型别名返回对应 config
export function getAliasConfig(alias: ModelAlias, env: Env) {
  switch (alias) {
    case 'auto/coding': return codeConfig(env)
    case 'auto/fast':   return fastConfig(env)
    case 'auto/cheap':  return cheapConfig(env)
    default:            return chatConfig(env)
  }
}
