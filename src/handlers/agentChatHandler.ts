// src/handlers/agentChatHandler.ts
//
// 模型别名路由：
//   auto/coding → codeConfig（支持流式）
//   auto/fast   → fastConfig（速度优先）
//   auto/cheap  → cheapConfig（免费优先，Pollinations 兜底）
//   auto/search → 预留，暂未实现，走 chatConfig 降级
//   其他/默认   → chatConfig
//
// 翻译请求：检测到关键词时跳过搜索，直接走 chatConfig

import { callGatewaySelf } from '../core/callGatewaySelf'
import { callGatewaySelfStream } from '../core/callGatewaySelfStream'
import {
  getAliasConfig,
  detectModelAlias,
  chatConfig,
  codeConfig,
} from '../config/modelTargets'

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

  // ── 翻译请求 → chatConfig，不搜索 ────────────────────────────────
  if (isTranslationRequest(body.messages)) {
    const config = chatConfig(c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'translation failed' }, 500)
    }
  }

  // ── 检测模型别名 ─────────────────────────────────────────────────
  const alias = detectModelAlias(body.model ?? '')

  // auto/coding → codeConfig，支持流式
  if (alias === 'auto/coding') {
    const config = codeConfig(c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'coding request failed' }, 500)
    }
  }

  // auto/fast / auto/cheap → 对应 config
  // auto/search 暂未实现，降级到 chatConfig
  // 无别名（默认）→ chatConfig
  const config = alias ? getAliasConfig(alias, c.env) : chatConfig(c.env)
  if (isStreaming) return callGatewaySelfStream(c, body, config)
  try {
    return c.json(await callWithFallback(c, body, config))
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
  }
}
