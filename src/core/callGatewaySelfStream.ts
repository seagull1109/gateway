// src/core/callGatewaySelfStream.ts
// 流式版本的 self-call，直接把上游的 SSE 流透传给客户端，
// 不做任何缓冲，Claude Code 等需要 stream 的工具必须走这条路径。

export async function callGatewaySelfStream(
  c: any,
  payload: unknown,
  configOverride?: object
): Promise<Response> {
  const headers = new Headers(c.req.raw.headers)
  headers.delete('content-length')
  headers.delete('host')

  if (configOverride) {
    headers.set('x-portkey-config', JSON.stringify(configOverride))
  }

  const targetUrl = new URL('/v1/internal/chat/completions', c.req.url).toString()

  const res = await c.env.SELF.fetch(
    new Request(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  )

  // 直接透传流，不经过 res.json()
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
