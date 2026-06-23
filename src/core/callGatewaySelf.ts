// src/core/callGatewaySelf.ts

export async function callGatewaySelf(c: any, payload: unknown) {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("content-length")
  headers.delete("host")

  // 直接打到已验证可用的自定义域名，绕开 *.workers.dev 自调用时返回 404 的怪行为。
  // GATEWAY_BASE_URL 没配的话兜底用当前请求的 origin（行为退回到原来那样）。
  const baseUrl = c.env.GATEWAY_BASE_URL || new URL(c.req.url).origin
  const targetUrl = new URL("/v1/chat/completions", baseUrl).toString()

  const selfReq = new Request(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })

  const res = await fetch(selfReq, { signal: AbortSignal.timeout(20000) })

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
