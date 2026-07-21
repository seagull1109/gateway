// src/middlewares/messagesConfig.ts
// /v1/messages 路由专用：注入支持 Anthropic Messages 格式的 provider config。
// Groq 不支持 Anthropic 格式，必须走 Gemini 或 DeepSeek。

import { Context } from 'hono'

export async function messagesConfig(c: Context, next: Function) {
  const anthropicConfig = {
    strategy: { mode: 'fallback' },
    retry: { attempts: 1, on_status_codes: [429, 500, 502, 503] },
    targets: [
      {
        // Gemini 支持 Anthropic Messages 格式（通过 Portkey 转换）
        provider: 'google',
        api_key: (c.env as any).GEMINI_KEY,
        override_params: { model: 'gemini-2.5-flash-lite' },
      },
      {
        provider: 'openrouter',
        api_key: (c.env as any).OPENROUTER_KEY,
        override_params: { model: 'google/gemini-2.0-flash-exp:free' },
      },
      {
        // DeepSeek 付费兜底
        provider: 'deepseek',
        api_key: (c.env as any).DP_KEY,
        override_params: { model: 'deepseek-chat' },
      },
    ],
  }

  const newHeaders = new Headers(c.req.raw.headers)
  newHeaders.set('x-portkey-config', JSON.stringify(anthropicConfig))
  c.req.raw = new Request(c.req.raw, { headers: newHeaders })

  await next()
}
