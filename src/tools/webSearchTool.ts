export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search realtime internet information for up-to-date facts",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Concise, specific search query"
        }
      },
      required: ["query"]
    }
  }
} as const
