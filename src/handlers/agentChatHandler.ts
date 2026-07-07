import { callGatewaySelf } from '../core/callGatewaySelf'
import { classifyIntent } from '../core/intentClassifier'
import { getIntentConfig, Intent } from '../config/modelTargets'

const DEFAULT_MAX_TOKENS = 2048

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

  const selfFetch = (req: Request) => c.env.SELF.fetch(req)
  const intent: Intent = await classifyIntent(body.messages, c.env, selfFetch)
  const intentConfig = getIntentConfig(intent, c.env)

  try {
    const resp = await callGatewaySelf(
      c,
      {
        ...body,
        stream: false,
        max_tokens: body.max_tokens ?? DEFAULT_MAX_TOKENS,
      },
      intentConfig
    )
    return c.json(resp)
  } catch (err: any) {
    return c.json({ error: true, message: err?.message ?? 'request failed' }, 500)
  }
}
