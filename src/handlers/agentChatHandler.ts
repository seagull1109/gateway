// src/handlers/agentChatHandler.ts

import { callGatewaySelf as runChatCompletion } from "../core/callGatewaySelf"
import { WEB_SEARCH_TOOL } from "../tools/webSearchTool"
import { searchFallback, summarizeSearchResult } from "../tools/search"

const MAX_LOOP = 3
const MAX_MESSAGES_CHARS = 60000

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
      messages: currentMessages,
      tool_choice: "none"
    })
    return c.json(finalResp)
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? "agent loop failed" }, 500)
  }
}
