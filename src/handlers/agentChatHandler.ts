// src/handlers/agentChatHandler.ts
//
// 去掉意图分类器，改为用户自己选模型别名：
//   auto/coding → codeConfig（支持流式，给 Claude Code 用）
//   auto/fast   → fastConfig（速度优先）
//   auto/cheap  → cheapConfig（免费优先）
//   auto/search → Gemini Google Search 直连
//   其他/默认   → 也走 Gemini Google Search（替代原来的意图分类+chat路由）
//
// 翻译请求例外：检测到翻译关键词时跳过搜索，直接走 chatConfig，
// 避免沉浸式翻译这类高频调用打爆 Gemini 免费层。

import { callGatewaySelf } from '../core/callGatewaySelf'
import { callGatewaySelfStream } from '../core/callGatewaySelfStream'
import { callGeminiWithSearch } from '../core/geminiSearch'
import {
  getAliasConfig,
  detectModelAlias,
  chatConfig,
  codeConfig,
} from '../config/modelTargets'

const DEFAULT_MAX_TOKENS = 2048

function hasGoogleSearchTool(tools: any[]): boolean {
  if (!Array.isArray(tools)) return false
  return tools.some(
    (t: any) => t?.google_search !== undefined || t?.type === 'google_search'
  )
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

  // ── 1. 显式带了 google_search tool → Gemini 直连 ─────────────────
  if (hasGoogleSearchTool(body.tools)) {
    try {
      return c.json(
        await callGeminiWithSearch(body.messages, c.env.GEMINI_KEY, 'gemini-2.5-flash-lite')
      )
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'Gemini search failed' }, 500)
    }
  }

  // ── 2. 翻译请求 → chatConfig，不搜索 ────────────────────────────────
  if (isTranslationRequest(body.messages)) {
    const config = chatConfig(c.env)
    if (isStreaming) return callGatewaySelfStream(c, body, config)
    try {
      return c.json(await callWithFallback(c, body, config))
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'translation failed' }, 500)
    }
  }

  // ── 3. 检测模型别名 ───────────────────────────────────────────────
  const alias = detectModelAlias(body.model ?? '')

  // auto/search 或默认（无别名）→ Gemini Google Search
  if (!alias || alias === 'auto/search') {
    try {
      return c.json(
        await callGeminiWithSearch(body.messages, c.env.GEMINI_KEY, 'gemini-2.5-flash-lite')
      )
    } catch {
      // Gemini 额度用完时降级回 chatConfig
      try {
        return c.json(await callWithFallback(c, body, chatConfig(c.env)))
      } catch (err: any) {
        return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
      }
    }
  }

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
  const config = getAliasConfig(alias, c.env)
  if (isStreaming) return callGatewaySelfStream(c, body, config)
  try {
    return c.json(await callWithFallback(c, body, config))
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
  }
}
