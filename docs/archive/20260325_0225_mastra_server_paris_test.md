# Mastra Server: Paris Test via Hono Endpoint

**Date**: 2026-03-25 02:25 UTC

---

## What we ran

Started the Mastra Hono server (`bun src/index.ts`) and called the Mini agent endpoint:

```bash
curl -X POST http://localhost:3000/api/agents/expert-search-mini/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Trouve la liste..."}],"maxSteps":10}'
```

## Result

- **Date**: 2026-03-10 (pdf-content) — correct
- **Time**: ~15s
- **Tokens**: 39,432 in / 598 out / 102 reasoning / 24,064 cached

## What the endpoint returns

The Mastra Hono endpoint returns structured JSON with everything:

```json
{
  "text": "agent's full response...",
  "usage": {
    "inputTokens": 39432,
    "outputTokens": 598,
    "totalTokens": 40030,
    "reasoningTokens": 102,
    "cachedInputTokens": 24064
  },
  "steps": [
    {
      "toolCalls": [
        { "payload": { "toolName": "fetchPage", "args": { "url": "..." } } }
      ],
      "toolResults": [
        { "payload": { "toolName": "fetchPage", "result": { "success": true, "title": "...", "pdfLinks": [...] } } }
      ]
    }
  ]
}
```

## Observability findings

### What we get from the endpoint response
- Full tool call names and arguments
- Full tool results (page text, PDF links, PDF content)
- Token usage including reasoning tokens and cache hits
- Step-by-step execution flow

### What we DON'T get
- Web search queries (invisible — handled internally by the provider)
- Timing per step (not in the response)
- The extraction step (it's a separate call, not part of the agent)

### Surprise: caching works
`cachedInputTokens: 24064` — OpenAI cached 60% of the input tokens. This means repeated runs on the same court would be cheaper. The instructions and tool definitions are cached.

### Surprise: reasoning tokens present
`reasoningTokens: 102` — even at default effort (no explicit setting), Mini does some reasoning. This is OpenAI's default behaviour for the Responses API.

## The real observability is in the response

We've been building custom trace loggers and fighting OpenTelemetry spans. But the Mastra Hono endpoint **already returns everything we need** as structured JSON. For a production API, we could:
1. Log the full response to a file/database
2. Extract step details from `steps[].toolCalls` and `steps[].toolResults`
3. Track `usage` for cost monitoring
4. No OpenTelemetry, no ConsoleExporter, no DefaultExporter needed
