// src/handlers/agentChatHandler.ts

import {
  callGatewaySelf,
} from '../core/callGatewaySelf'

import {
  callGatewaySelfStream,
} from '../core/callGatewaySelfStream'

import {
  detectModelAlias,
  getAliasConfig,
  codeConfig,
} from '../config/modelTargets'

const DEFAULT_MAX_TOKENS = 2048

// 暂时保持你原来的策略。
// MCP 的 tool_calls / tool 消息裁剪问题后面单独处理。
const MAX_MESSAGES = 50

function trimMessages(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGES) {
    return messages
  }

  const systemMsg =
    messages[0]?.role === 'system'
      ? [messages[0]]
      : []

  const recent = messages.slice(
    -(MAX_MESSAGES - systemMsg.length),
  )

  return [
    ...systemMsg,
    ...recent,
  ]
}

async function callGateway(
  c: any,
  body: any,
  config: object,
) {
  return callGatewaySelf(
    c,
    {
      ...body,

      stream: false,

      max_tokens:
        body.max_tokens ??
        DEFAULT_MAX_TOKENS,

      messages: trimMessages(
        body.messages,
      ),
    },
    config,
  )
}

export async function agentChatHandler(
  c: any,
) {
  let body: any

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        error: 'invalid json body',
      },
      400,
    )
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    return c.json(
      {
        error:
          'messages must be a non-empty array',
      },
      400,
    )
  }

  /*
   * ============================================================
   * 路由原则
   * ============================================================
   *
   * Gateway 不再分析用户意图。
   *
   * 不再：
   *   - 判断“翻译”
   *   - 判断“搜索”
   *   - 判断“coding”
   *   - 调用 geminiSearch
   *   - 根据 messages 内容自动切换模型
   *
   * 完全由客户端的 model 决定。
   *
   * 例如：
   *
   *   model = auto/cheap
   *   model = auto/fast
   *   model = auto/coding
   *   model = auto/search
   *   model = auto/image
   */

  const alias = detectModelAlias(
    body.model ?? '',
  )

  let config: object

  if (alias === 'auto/coding') {
    config = codeConfig(c.env)
  } else {
    config = getAliasConfig(
      alias,
      c.env,
    )
  }

  const payload = {
    ...body,

    messages: trimMessages(
      body.messages,
    ),
  }

  // ============================================================
  // Streaming
  // ============================================================

  if (body.stream === true) {
    return callGatewaySelfStream(
      c,
      payload,
      config,
    )
  }

  // ============================================================
  // Non-streaming
  // ============================================================

  try {
    return c.json(
      await callGateway(
        c,
        body,
        config,
      ),
    )
  } catch (err: any) {
    return c.json(
      {
        error: true,
        message:
          err?.message ??
          'request failed',
      },
      500,
    )
  }
}