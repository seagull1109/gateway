import { Intent, classifierConfig } from '../config/modelTargets'

const CLASSIFIER_SYSTEM = `You are an intent classifier. Classify the user message into exactly one category:
- chat: general conversation, questions, writing, translation, summaries, current events/news
- reasoning: math, logic, complex analysis, step-by-step thinking, research, planning
- code: programming, debugging, code review, scripts, SQL, technical implementations
- image: analyzing, describing, or understanding images or visual content

Respond with ONLY one word (chat, reasoning, code, or image). No explanation.`

export function hasImageContent(messages: any[]): boolean {
  return messages.some(
    (m: any) =>
      Array.isArray(m.content) &&
      m.content.some((c: any) => c.type === 'image_url')
  )
}

export async function classifyIntent(
  messages: any[],
  env: any,
  selfFetch: (req: Request) => Promise<Response>
): Promise<Intent> {
  if (hasImageContent(messages)) return 'image'

  const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')
  if (!lastUser) return 'chat'

  const content =
    typeof lastUser.content === 'string'
      ? lastUser.content.slice(0, 500)
      : 'image or file content'

  try {
    const res = await selfFetch(
      new Request('https://internal/v1/internal/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer internal-classifier',
          'x-portkey-config': JSON.stringify(classifierConfig(env)),
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 10,
          temperature: 0,
          messages: [
            { role: 'system', content: CLASSIFIER_SYSTEM },
            { role: 'user', content },
          ],
        }),
      })
    )

    if (!res.ok) return 'chat'

    const data: any = await res.json()
    const raw = (data?.choices?.[0]?.message?.content ?? '').toLowerCase().trim()

    if (raw.startsWith('reasoning')) return 'reasoning'
    if (raw.startsWith('code'))      return 'code'
    if (raw.startsWith('image'))     return 'image'
    return 'chat'
  } catch {
    return 'chat'
  }
}
