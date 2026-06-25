// src/core/callGatewaySelf.ts
//
// 通过 Service Binding 调用内部专用的 completions 路径，
// 注意：这里必须是 /v1/internal/chat/completions，不能再是 /v1/chat/completions，
// 因为对外的 /v1/chat/completions 现在已经是 agentChatHandler 了，
// 如果还打这个地址会变成自己无限调自己。

export async function callGatewaySelf(c: any, payload: unknown) {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("content-length")
  headers.delete("host")

  const targetUrl = new URL("/v1/internal/chat/completions", c.req.url).toString()

  const selfReq = new Request(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })

  const res = await c.env.SELF.fetch(selfReq)

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "")
    const err = new Error(`Gateway request failed: ${res.status} ${bodyText}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }

  return res.json()
}
