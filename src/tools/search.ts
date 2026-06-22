// src/tools/search.ts

interface SearchResultItem {
  title?: string
  url?: string
  content?: string
}

interface SearchResult {
  query?: string
  results?: SearchResultItem[]
  answer?: string
}

const SEARCH_TIMEOUT_MS = 8000
const MAX_QUERY_LENGTH = 400

function httpError(message: string, status?: number) {
  const err = new Error(message) as Error & { status?: number }
  if (status !== undefined) err.status = status
  return err
}

export async function tavilySearch(query: string, apiKey: string): Promise<SearchResult> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  })

  if (!res.ok) {
    throw httpError(`Tavily ${res.status}`, res.status)
  }

  return res.json()
}

export async function exaSearch(query: string, apiKey: string): Promise<SearchResult> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, numResults: 5 }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  })

  if (!res.ok) {
    throw httpError(`Exa ${res.status}`, res.status)
  }

  return res.json()
}

export async function searchFallback(
  rawQuery: unknown,
  tavilyKey: string,
  exaKey: string
): Promise<{ provider: "tavily" | "exa"; data: SearchResult }> {
  const query = String(rawQuery ?? "").trim().slice(0, MAX_QUERY_LENGTH)

  if (!query) {
    throw new Error("empty search query")
  }

  try {
    const data = await tavilySearch(query, tavilyKey)
    return { provider: "tavily", data }
  } catch (err) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      throw err
    }
    const data = await exaSearch(query, exaKey)
    return { provider: "exa", data }
  }
}

export function summarizeSearchResult(
  result: SearchResult,
  maxItems = 3,
  maxCharsPerItem = 500
): string {
  const items = (result.results ?? []).slice(0, maxItems).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, maxCharsPerItem)
  }))

  return JSON.stringify({ answer: result.answer ?? null, items })
}
