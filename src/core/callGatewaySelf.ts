export async function callGatewaySelf(
  c: any,
  payload: unknown,
  configOverride?: object
) {
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

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const err = new Error(
      `Gateway request failed: ${res.status} ${bodyText}`
    ) as Error & { status?: number }
    err.status = res.status
    throw err
  }

  return res.json()
}
