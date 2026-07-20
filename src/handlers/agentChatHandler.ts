// src/handlers/agentChatHandler.ts
//
// 请求处理优先级：
//   1. 有 google_search tool → Gemini 直连搜索
//   2. 检测到模型别名（auto/coding、auto/fast、auto/cheap）→ 跳过分类器，直接路由
//   3. 翻译请求 → 直接走 chatConfig（快速，不搜索）
//   4. 流式请求（stream: true）→ 跳过搜索，直接透传流
//   5. 其他 → 意图分类 → 路由 → Gemini 搜索（chat 类）

import { callGatewaySelf } from '../core/callGatewaySelf'
import { callGatewaySelfStream } from '../core/callGatewaySelfStream'
import { callGeminiWithSearch } from '../core/geminiSearch'
import { classifyIntent } from '../core/intentClassifier'
import {
  getIntentConfig,
  getAliasConfig,
  detectModelAlias,
  chatConfig,
  Intent,
} from '../config/modelTargets'
import { WEB_SEARCH_TOOL } from '../tools/webSearchTool'
import { searchFallback, summarizeSearchResult } from '../tools/search'

const DEFAULT_MAX_TOKENS = 2048
const MAX_LOOP = 3
const MAX_MESSAGES_CHARS = 60000

const SEARCH_NUDGE = {
  role: 'system',
  content:
    'You have access to a web_search tool. When the user asks about current events, news, prices, exchange rates, or anything requiring up-to-date or real-time information, you MUST call the web_search tool instead of saying you cannot access the internet or lack real-time data. Only skip the tool for clearly static, well-established facts.',
}

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

  // ── 1. google_search tool → Gemini 直连 ───────────────────────────
  if (hasGoogleSearchTool(body.tools)) {
    try {
      const resp = await callGeminiWithSearch(
        body.messages,
        c.env.GEMINI_KEY,
        'gemini-2.5-flash-lite'
      )
      return c.json(resp)
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'Gemini search failed' }, 500)
    }
  }

  // ── 2. 模型别名检测 → 跳过分类器直接路由 ───────────────────────────
  // 用户直接指定 model: "auto/coding" 等，不需要分类器猜意图。
  // 这也是 Claude Code 的推荐用法：把 gateway 的默认模型设为 auto/coding。
  const alias = detectModelAlias(body.model ?? '')
  if (alias) {
    if (alias === 'auto/search') {
      // auto/search → 强制走 Gemini Google Search
      try {
        const resp = await callGeminiWithSearch(
          body.messages,
          c.env.GEMINI_KEY,
          'gemini-2.5-flash-lite'
        )
        return c.json(resp)
      } catch (err: any) {
        return c.json({ error: true, message: err?.message ?? 'search failed' }, 500)
      }
    }

    const aliasConfig = getAliasConfig(alias, c.env)

    // auto/coding 且客户端要求流式 → 透传流
    if (alias === 'auto/coding' && isStreaming) {
      return callGatewaySelfStream(c, body, aliasConfig)
    }

    try {
      const resp = await callGatewaySelf(
        c,
        { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS },
        aliasConfig
      )
      return c.json(resp)
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
    }
  }

  // ── 3. 翻译请求 → chatConfig，不搜索，不分类 ────────────────────────
  if (isTranslationRequest(body.messages)) {
    const config = chatConfig(c.env)

    if (isStreaming) {
      return callGatewaySelfStream(c, body, config)
    }

    try {
      const resp = await callGatewaySelf(
        c,
        { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS },
        config
      )
      return c.json(resp)
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'translation failed' }, 500)
    }
  }

  // ── 4. 流式请求（非翻译、非别名）→ 意图分类后直接透传流，跳过搜索 ──
  // 流式场景下无法做 agent loop（需要等待完整响应才能判断 tool_calls），
  // 所以直接路由到对应模型，不带搜索工具。
  if (isStreaming) {
    const selfFetch = (req: Request) => c.env.SELF.fetch(req)
    const intent: Intent = await classifyIntent(body.messages, c.env, selfFetch)
    const intentConfig = getIntentConfig(intent, c.env)
    return callGatewaySelfStream(c, body, intentConfig)
  }

  // ── 5. 意图分类 → 路由 ─────────────────────────────────────────────
  const selfFetch = (req: Request) => c.env.SELF.fetch(req)
  const intent: Intent = await classifyIntent(body.messages, c.env, selfFetch)
  const intentConfig = getIntentConfig(intent, c.env)

  // image → 直接调用，不搜索
  if (intent === 'image') {
    try {
      const resp = await callGatewaySelf(
        c,
        { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS },
        intentConfig
      )
      return c.json(resp)
    } catch (err: any) {
      return c.json({ error: true, message: err?.message ?? 'image request failed' }, 500)
    }
  }

  // chat → Gemini Google Search（对 NextChat 等客户端透明）
  if (intent === 'chat') {
    try {
      return c.json(
        await callGeminiWithSearch(body.messages, c.env.GEMINI_KEY, 'gemini-2.5-flash-lite')
      )
    } catch {
      // Gemini 额度用完时降级回 Portkey chat 链
      try {
        return c.json(
          await callGatewaySelf(
            c,
            { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS },
            intentConfig
          )
        )
      } catch (err: any) {
        return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
      }
    }
  }

  // reasoning / code → agent loop（带 web_search 工具）
  let messages = [SEARCH_NUDGE, ...body.messages]
  let loopCount = 0

  try {
    while (loopCount < MAX_LOOP) {
      const resp = await callGatewaySelf(
        c,
        {
          ...body,
          stream: false,
          max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
          messages,
          tools: [WEB_SEARCH_TOOL],
          tool_choice: 'auto',
        },
        intentConfig
      )

      const msg = resp?.choices?.[0]?.message
      if (!msg) return c.json({ error: true, message: 'upstream returned no message' }, 502)
      if (!msg.tool_calls?.length) return c.json(resp)

      messages.push(msg)

      const toolMessages = await Promise.all(
        msg.tool_calls.map(async (toolCall: any) => {
          let args: { query?: string }
          try { args = JSON.parse(toolCall.function.arguments) }
          catch {
            return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'invalid args' }) }
          }
          try {
            const { data } = await searchFallback(args.query, c.env.TAVILY_API_KEY, c.env.EXA_API_KEY)
            return { role: 'tool', tool_call_id: toolCall.id, content: summarizeSearchResult(data) }
          } catch (err: any) {
            return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: err?.message ?? 'search failed' }) }
          }
        })
      )

      messages.push(...toolMessages)

      if (JSON.stringify(messages).length > MAX_MESSAGES_CHARS) {
        messages = [messages[0], ...messages.slice(-10)]
      }

      loopCount++
    }

    return c.json(
      await callGatewaySelf(
        c,
        { ...body, stream: false, max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS, messages, tool_choice: 'none' },
        intentConfig
      )
    )
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'agent loop failed' }, 500)
  }
}
