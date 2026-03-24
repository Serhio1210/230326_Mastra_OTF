# Optimization: toModelOutput + Structuring Improvements

**Date**: 2026-03-24 08:12 UTC

---

## What we implemented

### 1. `toModelOutput` on fetchPage
- Model no longer sees 10k chars of raw pageText
- Instead sees: PDF links with URLs + date hints extracted via regex
- Full data still available to the app via `execute` return

### 2. `toModelOutput` on extractPdfDate
- Model sees first 500 chars of PDF text (where dates always are)
- Full 5-page text still available to the app

### 3. PDF extraction increased to 5 pages
- Was 3 pages (5,176 chars), now 5 pages (12,603 chars)
- Safety margin for courts with different layouts

### 4. `TokenLimiter` processor on agent
- `new TokenLimiter(100000)` on inputProcessors
- Prevents context overflow on complex multi-step searches

### 5. Structuring `instructions` parameter
- Custom instructions guide the structuring model on what to extract
- This was the key missing piece — without it, Sonnet garbled tool history into schema fields

---

## What we tried and learned

### `prepareStep` for single-flow structured output
- **Tried**: disable tools on final step, enable structured output
- **Result**: returned `null` for publicationDate — the step boundary confused the structuring
- **Decision**: dropped this approach

### `jsonPromptInjection: true`
- **Tried**: inject schema into prompt instead of response_format
- **Result**: `result.object` was `undefined` — Sonnet didn't produce valid JSON
- **Decision**: dropped, works better without it for Anthropic models

### Sonnet 4.6 for structuring
- **Tried**: same model (Sonnet) for both agent + structuring
- **Result**: garbled output — mixed reasoning text into schema fields, or returned null dates
- **Root cause**: Sonnet receives the full conversation history including all tool calls as context for the structuring call. Even with toModelOutput reducing what the agent sees during reasoning, the structuring call still gets the raw history. Sonnet is too "creative" — it tries to reason about the data instead of just extracting it.
- **Decision**: Haiku 4.5 is the right model for structuring. It's a simple extraction task — pull fields from text into JSON. Haiku does this perfectly without overthinking.

---

## Final architecture

```
Sonnet 4.6 (agent)        → web search, fetchPage, extractPdfDate
  ↓ toModelOutput           → compact context for reasoning
  ↓ TokenLimiter            → safety net for context size
  ↓
Haiku 4.5 (structuring)   → extract fields into Zod schema
  ↓ instructions            → "Extract court name, URLs, date..."
  ↓ errorStrategy: warn     → don't crash on parse failures
```

## Test results

| Test | Pass | Assertions | Time |
|---|---|---|---|
| 02-fetch-page.test.ts | 2/2 | 17 | 0.2s |
| 04-extract-pdf-date.test.ts | 2/2 | 8 | 1.8s |
| 06-optimized-pipeline.test.ts | 1/1 | 11 | 65.6s |

Paris result: `publicationDate: "2026-03-10"`, `source: "pdf-content"`
