export async function callGatewaySelf(c: any, payload: unknown) {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("content-length")
  headers.delete("host")

  const targetUrl = new URL("/v1/chat/completions", c.req.url).toString()
  console.log("[callGatewaySelf] target url:", targetUrl)

  const selfReq = new Request(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })

  const res = await fetch(selfReq, { signal: AbortSignal.timeout(20000) })

  console.log("[callGatewaySelf] response status:", res.status)

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "")
    console.log("[callGatewaySelf] response body:", bodyText)
    const err = new Error(`Gateway request failed: ${res.status}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }

  return res.json()
}
