// src/handlers/agentChatHandler.ts

import { callGatewaySelf } from '../core/callGatewaySelf'
import { callGatewaySelfStream } from '../core/callGatewaySelfStream'
import { detectModelAlias, getAliasConfig, chatConfig, codeConfig } from '../config/modelTargets'

const DEFAULT_MAX_TOKENS = 2048

// Groq 不支持超过 ~500 条消息，其他 provider 也有各自限制。
// 裁剪策略：始终保留第一条（通常是 system 消息），再保留最近 N 条。
const MAX_MESSAGES = 50

function trimMessages(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGES) return messages
  const systemMsg = messages[0]?.role === 'system' ? [messages[0]] : []
  const recent = messages.slice(-(MAX_MESSAGES - systemMsg.length))
  return [...systemMsg, ...recent]
}

function isTranslationRequest(messages: any[]): boolean {
  const KEYWORDS = ['translate', 'translation', 'translator', '翻译', 'transla']
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content.toLowerCase() : ''
    if (KEYWORDS.some((k) => content.includes(k))) return true
  }
  return false
}

async function callWithFallback(c: any, body: any, config: object) {
  return callGatewaySelf(
    c,
    {
      ...body,
      stream: false,
      max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages: trimMessages(body.messages),
    },
    config
  )
}

export async function agentChatHandler(c: any) {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid json body' }, 400)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: 'messages must be a non-empty array' }, 400)
  }

  const isStreaming = body.stream === true

  // ── 翻译请求 ────────────────────────────────────────────────────────
  if (isTranslationRequest(body.messages)) {
    const config = chatConfig(c.env)
    if (isStreaming) {
      return callGatewaySelfStream(
        c,
        { ...body, messages: trimMessages(body.messages) },
        config
      )
    }
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'translation failed' }, 500)
    }
  }

  // ── 模型别名路由 ─────────────────────────────────────────────────────
  const alias = detectModelAlias(body.model ?? '')

  if (alias === 'auto/coding') {
    const config = codeConfig(c.env)
    if (isStreaming) {
      return callGatewaySelfStream(
        c,
        { ...body, messages: trimMessages(body.messages) },
        config
      )
    }
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'coding request failed' }, 500)
    }
  }

  if (alias === 'auto/fast') {
    const config = getAliasConfig(alias, c.env)
    if (isStreaming) {
      return callGatewaySelfStream(
        c,
        { ...body, messages: trimMessages(body.messages) },
        config
      )
    }
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'fast request failed' }, 500)
    }
  }

  // auto/cheap / auto/search / 默认
  const config = alias ? getAliasConfig(alias, c.env) : chatConfig(c.env)
  if (isStreaming) {
    return callGatewaySelfStream(
      c,
      { ...body, messages: trimMessages(body.messages) },
      config
    )
  }
  try {
    return c.json(await callWithFallback(c, body, config))
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
  }
}
