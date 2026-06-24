// src/handlers/agentChatHandler.ts

import { callGatewaySelf as runChatCompletion } from "../core/callGatewaySelf"
import { WEB_SEARCH_TOOL } from "../tools/webSearchTool"
import { searchFallback, summarizeSearchResult } from "../tools/search"

const MAX_LOOP = 3
const MAX_MESSAGES_CHARS = 60000
// 之前没显式设置 max_tokens，遇到会深度思考的模型时，思考本身就可能把
// token 预算耗光，导致最终可见的回复内容是空的。这里给一个足够大的默认值，
// 如果调用方（Chatbox）自己传了 max_tokens 就用它的，没传才用这个兜底。
const DEFAULT_MAX_TOKENS = 2048

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

  let currentMessages = [...body.messages]
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
