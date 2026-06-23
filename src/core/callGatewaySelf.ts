// src/core/callGatewaySelf.ts
//
// 之前用全局 fetch() 自己调自己，在 workers.dev 域名上返回 404，
// 在走 Route 绑定的自定义域名上返回 522 —— 这是 Cloudflare 对
// "worker 自己调自己" 这种公网请求的限制，换哪个域名都绕不过去。
//
// 正确做法：用 Service Binding（在 wrangler.toml 里加 [[services]]）
// 直接在 Cloudflare 内部转发给同一个 worker 脚本，
// 这样既不走公网那层限制，又完整保留 requestValidator + 自定义中间件
// + chatCompletionsHandler 这条完整链路。

export async function callGatewaySelf(c: any, payload: unknown) {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("content-length")
  headers.delete("host")

  const targetUrl = new URL("/v1/chat/completions", c.req.url).toString()

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
