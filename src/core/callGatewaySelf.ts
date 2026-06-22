// src/core/callGatewaySelf.ts
//
// 通过 self-fetch 复用 /v1/chat/completions 完整的处理链路
// (requestValidator + 你自定义的配置注入中间件 + chatCompletionsHandler)，
// 而不是重新实现一遍这些逻辑。
//
// 修复了两个问题：
//   1. 显式删除 content-length / host，避免和新 body 字节数不匹配
//   2. 真正接上了超时，避免一次慢请求拖死整条 agent loop

export async function callGatewaySelf(c: any, payload: unknown) {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("content-length")
  headers.delete("host")

  const selfReq = new Request(
    new URL("/v1/chat/completions", c.req.url).toString(),
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }
  )

  const res = await fetch(selfReq, { signal: AbortSignal.timeout(20000) })

  if (!res.ok) {
    const err = new Error(`Gateway request failed: ${res.status}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }

  return res.json()
}
