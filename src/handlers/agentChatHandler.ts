// src/handlers/agentChatHandler.ts

import { callGatewaySelf as runChatCompletion } from "../core/callGatewaySelf"
import { WEB_SEARCH_TOOL } from "../tools/webSearchTool"
import { searchFallback, summarizeSearchResult } from "../tools/search"

const MAX_LOOP = 3
const MAX_MESSAGES_CHARS = 60000
const DEFAULT_MAX_TOKENS = 2048

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You have access to a web_search tool. When the user asks about current events, news, prices, exchange rates, or anything requiring up-to-date or real-time information, you MUST call the web_search tool instead of saying you cannot access the internet or lack real-time data. Only skip the tool for clearly static, well-established facts."
}

export async function agentChatHandler(c: any) {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "invalid json body" }, 400)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "messages must be a non-empty array" }, 400)
  }

  // 不再判断"是不是已经有 system 消息"——像 NextChat 这类客户端经常自己会带一条
  // system 消息（默认人设、历史压缩摘要等），如果命中这种情况，按"有就跳过"的逻辑，
  // 我们这条"必须调用 web_search"的提示就完全没生效。直接追加在最前面，
  // 跟原有的 system 消息共存，绝大多数模型/接口都能正确处理多条 system 消息。
  let currentMessages = [SYSTEM_PROMPT, ...body.messages]

  let loopCount = 0

  try {
    while (loopCount < MAX_LOOP) {
      const resp = await runChatCompletion(c, {
        ...body,
        stream: false,
        max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
        messages: currentMessages,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: "auto"
      })

      const msg = resp?.choices?.[0]?.message
      if (!msg) {
        return c.json({ error: true, message: "upstream returned no message" }, 502)
      }

      if (!msg.tool_calls?.length) {
        return c.json(resp)
      }

      currentMessages.push(msg)

      const toolMessages = await Promise.all(
        msg.tool_calls.map(async (toolCall: any) => {
          let args: { query?: string }
          try {
            args = JSON.parse(toolCall.function.arguments)
          } catch {
            return {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: "invalid tool arguments" })
            }
          }

          try {
            const { data } = await searchFallback(
              args.query,
              c.env.TAVILY_API_KEY,
              c.env.EXA_API_KEY
            )
            return {
              role: "tool",
              tool_call_id: toolCall.id,
              content: summarizeSearchResult(data)
            }
          } catch (err: any) {
            return {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: err?.message ?? "search failed" })
            }
          }
        })
      )

      currentMessages.push(...toolMessages)

      if (JSON.stringify(currentMessages).length > MAX_MESSAGES_CHARS) {
        currentMessages = [currentMessages[0], ...currentMessages.slice(-10)]
      }

      loopCount++
    }

    const finalResp = await runChatCompletion(c, {
      ...body,
      stream: false,
      max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages: currentMessages,
      tool_choice: "none"
    })
    return c.json(finalResp)
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? "agent loop failed" }, 500)
  }
}
