# Web Search: open_page, find_in_page, and What We Can See

**Date**: 2026-03-25 10:57 UTC

---

## web_search is a mini browser, not just a search tool

The `web_search` tool in OpenAI's Responses API has three action types:

| Action | What it does | Available on |
|---|---|---|
| `search` | Runs a web search query | All models |
| `open_page` | Opens and reads a full web page | Reasoning models only (o3, o4-mini, gpt-5) |
| `find_in_page` | Searches for text within an opened page | Reasoning models only |

With reasoning models, the web search tool can:
1. Search for a query → get results
2. `open_page` on a search result → read the full page
3. `find_in_page` → look for specific content on that page
4. Follow links, open more pages, search within them

This is why GPT-5.4 full sometimes finds better results than Mini — it can browse pages, follow navigation links, and dig deeper into content, all inside the `web_search_call` black box.

**GPT-5.4 Mini at `effort: none`** only gets the `search` action. No page opening, no content reading.

---

## What we CAN see inside web_search_call

### Default response (minimal)
```json
{
  "type": "web_search_call",
  "id": "ws_67c9fa05...",
  "status": "completed"
}
```
Almost nothing — just that a search happened and it completed.

### With `include: ["web_search_call.action.sources"]`
Exposes the **sources** (URLs) the model consulted:
- Full list of URLs accessed during the search
- The number of sources is often greater than the number of citations
- Includes real-time feeds (`oai-sports`, `oai-weather`, `oai-finance`)

### With search queries
The `action` object contains:
- `type` — "search", "open_page", or "find_in_page"
- `queries` — the actual search terms (not always present)
- `sources` — URLs consulted (when requested via `include`)

### What we still CAN'T see
- **The full content** of pages opened via `open_page` — only the URLs
- **What the model read** on those pages — the page content is not returned
- **The model's internal reasoning** about what it found — it's inside the reasoning trace
- **Which search results it chose to open** vs skip
- **`find_in_page` patterns** — what it searched for within pages

---

## How the AI SDK exposes this

The `@ai-sdk/openai` already supports the `include` parameter:

```typescript
const result = await generateText({
  model: openai('gpt-5.4'),
  tools: { web_search: openai.tools.webSearch({ ... }) },
  providerOptions: {
    openai: {
      include: ['web_search_call.action.sources'],
    },
  },
  prompt: '...',
});

// Sources are available in result.sources
console.log(result.sources);
```

Our Mastra Mini agent config already sends `include: ["web_search_call.action.sources"]` (verified from the API request body in earlier debugging).

---

## What this means for our project

### Why GPT-5.4 full finds better results
It can `open_page` on search results and follow links to find the experts page. When the homepage doesn't directly link to experts, it navigates. Mini can't do this — it relies on search results pointing directly to the right page.

### Why our custom fetchPage is still valuable
1. **Works with Mini** — Mini at `effort: none` has no `open_page` capability
2. **Visible in traces** — we see exactly what was fetched, what PDFs were found, what dates were extracted
3. **Deterministic** — cheerio parsing, PDF link extraction, date hints — all controlled by us
4. **PDF reading** — `open_page` may read HTML but our `extractPdfDate` reads actual PDF binary content via `unpdf`

### The black box problem
Even with `include: ["web_search_call.action.sources"]`, we only see **which URLs** were accessed, not **what the model read** on those pages. For debugging why a model picked the wrong PDF or missed a date, the web search internals are opaque. Our custom tools provide full visibility.

### Potential optimisation with GPT-5.4 full
If we use GPT-5.4 full with `effort: low` and no custom tools (just web search), the model might:
- Search → find the court page
- `open_page` → read the page, see PDF links
- `open_page` → follow a PDF link (if it can read PDFs via open_page?)
- Extract the date from its reading

**Unknown**: can `open_page` read PDF content? Probably not — PDFs are binary. Our `extractPdfDate` tool is likely still needed even with `open_page`.

---

## Summary

| What we want to know | Can we see it? | How |
|---|---|---|
| Did a web search happen? | Yes | `web_search_call` in response output |
| What was searched? | Partially | `action.queries` (not always present) |
| What URLs were accessed? | Yes | `include: ["web_search_call.action.sources"]` |
| What pages were opened? | **No** — only URLs, not content |  |
| What was found on pages? | **No** — content stays inside the model's context |  |
| What text was searched within pages? | **No** — `find_in_page` patterns are hidden |  |
| Why the model chose a specific result? | **No** — reasoning is internal |  |

**Bottom line**: We can see WHAT the model searched and WHICH URLs it visited, but NOT WHAT it read on those pages. For full visibility, our custom tools remain essential.
