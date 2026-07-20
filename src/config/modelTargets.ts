export type Intent = 'chat' | 'reasoning' | 'code' | 'image'

export type ModelAlias =
  | 'auto/coding'
  | 'auto/fast'
  | 'auto/cheap'
  | 'auto/search'
  | null

const NIM_HOST = 'https://integrate.api.nvidia.com/v1'
const CEREBRAS_HOST = 'https://api.cerebras.ai/v1'
// Pollinations：不需要 key，完全免费，永不限速，作为最终兜底
const POLLINATIONS_HOST = 'https://text.pollinations.ai/openai'

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

export function detectModelAlias(model: string): ModelAlias {
  if (!model) return null
  const m = model.toLowerCase()
  if (m === 'auto/coding' || m === 'coding') return 'auto/coding'
  if (m === 'auto/fast' || m === 'fast') return 'auto/fast'
  if (m === 'auto/cheap' || m === 'cheap') return 'auto/cheap'
  if (m === 'auto/search' || m === 'search') return 'auto/search'
  return null
}

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
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
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
      {
        // Pollinations：完全免费，不需要 key，永不限速，最终兜底
        // 支持 openai, claude, mistral, llama 等多个模型
        provider: 'openai',
        api_key: 'no-key-needed',
        custom_host: POLLINATIONS_HOST,
        override_params: { model: 'openai' },
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
