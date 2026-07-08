export type Intent = 'chat' | 'reasoning' | 'code' | 'image'

const NIM_HOST = 'https://integrate.api.nvidia.com'

const RETRY = {
  attempts: 1,
  on_status_codes: [429, 500, 502, 503, 504],
}

interface Env {
  GROQ: string
  NVIDIA_NIM_KEY: string
  GEMINI_KEY: string
  OPENROUTER_KEY: string
  DP_KEY: string
  [key: string]: string
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
    ],
  }
}

export function imageConfig(env: Env) {
  return {
    strategy: { mode: 'fallback' },
    retry: RETRY,
    targets: [
      {
        // Gemini Flash Lite：多模态最稳，免费层
        provider: 'google',
        api_key: env.GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        // NIM Phi-4 Multimodal
        provider: 'openai',
        api_key: env.NVIDIA_NIM_KEY,
        custom_host: NIM_HOST,
        override_params: { model: 'microsoft/phi-4-multimodal-instruct' },
      },
      {
        // OpenRouter Gemini 2.0 Flash 免费版
        provider: 'openrouter',
        api_key: env.OPENROUTER_KEY,
        override_params: { model: 'google/gemini-2.0-flash-exp:free' },
      },
      {
        // OpenRouter Llama 4 Maverick（支持视觉，免费）替换原来需要付费的 gemini-2.5-pro
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
