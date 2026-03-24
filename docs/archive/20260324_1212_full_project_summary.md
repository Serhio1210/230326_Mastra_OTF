# Project Summary: 230326_Mastra_OTF

**Date**: 2026-03-24 12:12 UTC
**Duration**: ~6 hours of building and testing
**Result**: 35/36 French courts pass (97.2%)

---

## What we built

An AI agent that finds the official list of judicial experts ("experts judiciaires") for any French Cour d'appel, extracts the PDF, reads it, and returns the official publication date.

**Stack**: Bun + Hono + Mastra + Anthropic Claude Sonnet 4.6

---

## Architecture (final)

```
Step 1: Agent (Sonnet 4.6 + tools)
        → web search (webSearch_20260209 with France location)
        → fetchPage (cheerio HTML parsing)
        → extractPdfDate (unpdf text extraction, 5 pages)
        → produces text summary of findings

Step 2: Extraction (Sonnet 4.6, no tools)
        → clean prompt with agent's summary only
        → native structured output (Output.object + Zod schema)
        → adaptive thinking, effort: low
        → produces validated JSON
```

---

## Problems encountered and how we solved them

### 1. Model ID not found
**Problem**: `claude-sonnet-4-5-20250514` → 404.
**Solution**: Correct ID is `claude-sonnet-4-5-20250929`. Later moved to `claude-sonnet-4-6`.

### 2. `web_search_20260209` assumed unavailable
**Problem**: AI SDK docs only showed `webSearch_20250305`. We assumed the newer version wasn't available and built a raw `@anthropic-ai/sdk` workaround.
**Solution**: Checked the CHANGELOG and `node_modules` — `@ai-sdk/anthropic@3.0.54` already had it. The code shipped before the docs were updated.
**Lesson**: Check the CHANGELOG and source, not just the docs.

### 3. Web search returns stale data
**Problem**: Agent with web search only returned a January 2025 PDF for Paris. The actual page had a March 2026 update.
**Solution**: Added `fetchPage` tool — reads the actual HTML page, not the search index. Found the correct 2026-03-10 PDF.
**Lesson**: Search indexes lag behind real page content. Always fetch the source.

### 4. Date priority chain was backwards
**Problem**: We had page-text and filename as primary, PDF content as fallback.
**Solution**: Reversed the chain. The PDF is the official legal document — its date is authoritative.
**Lesson**: Think about what the official source of truth is, not what's easiest to extract.

### 5. Structured output + tool calling conflict
**Problem**: When Mastra's `structuredOutput: { schema }` is used without a separate model, it tries to use native `response_format` on the same call that has tools. The model must produce tool-call JSON AND schema-constrained JSON simultaneously — they fight each other.
**How we discovered this**: Sonnet garbled its output, putting agent reasoning text into the `courtName` field: `"}Excellent ! La page officielle..."`.
**Solution**: Use a separate model for structuring (Path B), or better — our clean prompt approach (Step 2 above).

### 6. Sonnet garbles structuring from long conversations
**Problem**: Even with a separate structuring call (Mastra Path B), Sonnet received the full conversation history (~40k tokens) including all tool calls, tool results, and reasoning. It tried to reason about all of it instead of just extracting fields.
**Root cause**: Context rot — extraction quality degrades with long context. Sonnet over-reasons on what should be a simple extraction task.
**Solution**: Clean prompt approach — give the extraction model only the agent's summary (~3k tokens), not the full conversation. Any model works perfectly with clean, focused input.

### 7. Structuring model timeout
**Problem**: Sonnet 4.6 timed out at 180s and 300s when structuring from the full conversation with 3 tools.
**Root cause**: Massive context from tool results (even with `toModelOutput` compression, the stream parts contain full data).
**Solution**: `toModelOutput` on both tools (reduces what the agent sees during reasoning) + clean prompt approach (reduces what the extraction model sees).

### 8. `toModelOutput` too aggressive
**Problem**: Initial `toModelOutput` on `fetchPage` filtered too aggressively — only showed "expert PDFs". The agent couldn't see all PDF URLs to pick the right one.
**Solution**: Show all PDFs with URLs but drop the 10k raw `pageText`. Keep the URLs, drop the noise.

### 9. `prepareStep` broke structured output
**Problem**: Tried disabling tools on the final step to force structured output. Returned `null` for publication date.
**Solution**: Abandoned `prepareStep` for this use case. The clean prompt approach is simpler and more reliable.

### 10. `jsonPromptInjection: true` produced undefined
**Problem**: Injecting the schema into the prompt instead of using `response_format`. Sonnet generated text that explained JSON instead of outputting it.
**Solution**: Don't use `jsonPromptInjection` with Anthropic models that support native structured output.

### 11. Mastra structuring instructions missing
**Problem**: Default Mastra structuring instructions are generic ("convert unstructured text into JSON"). No guidance on what to extract from our specific data.
**Solution**: Custom `instructions` parameter: "Extract court name, URLs, date in YYYY-MM-DD format..."

### 12. Thinking/effort settings not configured
**Problem**: Agent used default Sonnet settings — deep reasoning for a straightforward search task.
**Solution**: `effort: "low"` + `thinking: { type: "adaptive" }` for the extraction call. Saved ~7s per run.

### 13. Besançon legacy site dead
**Problem**: `ca-besancon.justice.fr` is completely inaccessible (HTTP and HTTPS). The agent fell back to an association site and got a 2024 PDF.
**Status**: Known problem from reference project. No fix — the court's legacy site is down.

### 14. Cayenne: AI SDK bug with dynamic filtering
**Problem**: `web_search_20260209` returned a `code_execution_tool_result_error` that the AI SDK couldn't parse. Zod validation failed on `{"type":"code_execution_tool_result_error","errorCode":"unavailable"}`.
**Status**: Bug in `@ai-sdk/anthropic` — doesn't handle this error type from Anthropic's dynamic filtering. Not our agent's fault.

### 15. Rate limiting at 2M tokens/minute
**Problem**: Running 5 concurrent courts hit Anthropic's rate limit.
**Solution**: Sequential retry. For production, add retry logic with exponential backoff.

---

## Mastra features used

| Feature | How we used it |
|---|---|
| `Agent` | Sonnet 4.6 with custom instructions |
| Provider tools (`webSearch_20260209`) | Anthropic web search with France location |
| Custom tools (`createTool`) | `fetchPage` (HTML parsing), `extractPdfDate` (PDF reading) |
| `toModelOutput` | Compact tool results for agent context |
| `outputSchema` | Typed tool returns |
| `TokenLimiter` processor | Cap context at 100k |
| `structuredOutput.instructions` | Guide the extraction model |
| `structuredOutput.errorStrategy` | Warn on parse failures |
| `effort: "low"` | Reduce reasoning overhead |

## Mastra features we tried and abandoned

| Feature | Why |
|---|---|
| `jsonPromptInjection` | Produced undefined with Anthropic |
| `prepareStep` | Broke structured output |
| `structuredOutput` without separate model (Path A) | Tool calling conflict |
| Mastra structuring with Sonnet (Path B, same model) | Context rot, garbled output |
| Workflows (`createWorkflow`) | Agent flow is non-linear — tools are the right pattern |

---

## Test results: 36 courts

| Result | Count | Courts |
|---|---|---|
| Pass (pdf-content) | 18 | Paris, Aix, Chambéry, Colmar, Lyon, Agen, Bourges, Caen, Dijon, Grenoble, Limoges, Montpellier, Nîmes, Reims, Rennes, Versailles, Basse-Terre, Fort-de-France, Saint-Denis |
| Pass (page-text) | 7 | Angers, Bastia, Orléans, Rouen, Toulouse, Nouméa, Papeete |
| Pass (link-text) | 2 | Nancy, Pau |
| Pass (filename) | 7 | Amiens, Besançon, Bordeaux, Metz, Douai, Poitiers, Riom |
| Pass (not-found) | 1 | Douai (no exact date in PDF, only "POUR L'ANNÉE 2026") |
| Fail (SDK bug) | 1 | Cayenne (`code_execution_tool_result_error`) |

**35/36 pass (97.2%)**

---

## Key insights

1. **PDF content is the official truth** — the date inside the document is the legal date, not the filename or page text
2. **Web search indexes lag** — always fetch the actual page to find the latest PDF
3. **Clean prompts beat long conversations** — for structured extraction, give the model only what it needs
4. **Smaller/simpler models can be better at extraction** — Haiku extracts mechanically, Sonnet over-reasons. But Sonnet works perfectly with clean input
5. **`toModelOutput` is essential** — reduces context for the agent during reasoning and prevents context rot
6. **Native structured output works** — but only when separated from tool calling
7. **Check the CHANGELOG, not just the docs** — features ship before documentation catches up
