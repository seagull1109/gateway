// src/handlers/agentChatHandler.ts
//
// 纯模型别名路由，不做任何意图分类：
//   auto/coding / coding → codeConfig（支持流式）
//   auto/fast   / fast   → fastConfig（支持流式）
//   auto/cheap  / cheap  → cheapConfig
//   auto/search / search → 预留（暂走 chatConfig）
//   其他/默认           → chatConfig
//
// 翻译请求强制走 chatConfig（跳过可能的搜索逻辑，避免高频 429）

import { callGatewaySelf } from '../core/callGatewaySelf'
import { callGatewaySelfStream } from '../core/callGatewaySelfStream'
import { detectModelAlias, getAliasConfig, chatConfig, codeConfig } from '../config/modelTargets'

const DEFAULT_MAX_TOKENS = 2048

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
    { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS },
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

  // ── 翻译请求：强制走 chatConfig，不搜索 ──────────────────────────
  if (isTranslationRequest(body.messages)) {
    const config = chatConfig(c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'translation failed' }, 500)
    }
  }

  // ── 模型别名路由 ──────────────────────────────────────────────────
  const alias = detectModelAlias(body.model ?? '')

  // auto/coding：代码专用，支持流式
  if (alias === 'auto/coding') {
    const config = codeConfig(c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'coding request failed' }, 500)
    }
  }

  // auto/fast：速度优先，支持流式
  if (alias === 'auto/fast') {
    const config = getAliasConfig(alias, c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'fast request failed' }, 500)
    }
  }

  // auto/cheap / auto/search / 默认（无别名）→ 对应 config，不支持流式
  const config = alias ? getAliasConfig(alias, c.env) : chatConfig(c.env)
  if (isStreaming) return callGatewaySelfStream(c, body, config)
  try {
    return c.json(await callWithFallback(c, body, config))
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
  }
}
