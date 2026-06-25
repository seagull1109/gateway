// src/handlers/agentChatHandler.ts

import { callGatewaySelf as runChatCompletion } from "../core/callGatewaySelf"
import { WEB_SEARCH_TOOL } from "../tools/webSearchTool"
import { searchFallback, summarizeSearchResult } from "../tools/search"

const MAX_LOOP = 3
const MAX_MESSAGES_CHARS = 60000
const DEFAULT_MAX_TOKENS = 2048

// 有些模型（比如 deepseek）默认偏保守，即便递了 web_search 工具，
// 也倾向于直接用训练时记住的"我没有联网功能"话术敷衍过去，不会主动调用。
// 加一条明确指令，提高它真正触发 tool_call 的概率。
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

  let currentMessages = [...body.messages]

  // 只在用户/客户端没自己传 system 消息的情况下加，避免覆盖 Chatbox 等客户端
  // 自己配置的 system prompt。
  const hasSystemMessage = currentMessages.some((m: any) => m.role === "system")
  if (!hasSystemMessage) {
    currentMessages = [SYSTEM_PROMPT, ...currentMessages]
  }

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
