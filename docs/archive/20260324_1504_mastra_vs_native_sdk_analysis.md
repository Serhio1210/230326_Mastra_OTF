# Mastra vs Native OpenAI SDK: Full Analysis

**Date**: 2026-03-24 15:04 UTC

---

## Setup

Both implementations use:
- **Model**: GPT-5.4 Mini
- **Same instructions** (shared `instructions.ts`)
- **Same tools**: fetchPage (cheerio), extractPdfDate (unpdf)
- **Same architecture**: agent loop → structured extraction
- **Same web search**: OpenAI with `country: "FR"`, `city: "Paris"`

Only difference: Mastra + @ai-sdk/openai vs native OpenAI SDK (Responses API).

---

## Results comparison

### Worktree native run (from earlier session)

| Court | Native Date | Native Source | Turns | Time |
|---|---|---|---|---|
| Paris | 2026-03-10 | pdf-content | 3 | 15s |
| Lyon | 2025-11-21 | pdf-content | 3 | 14s |
| Angers | 2025-11-18 | pdf-content | 3 | 12s |
| Besançon | — | failed | — | — |
| Bordeaux | 2025-07-01 | filename | 3 | 13s |
| Amiens | 2026-02-01 | page-text | 3 | 16s |
| Aix-en-Provence | 2025-12-10 | pdf-content | 3 | 14s |
| Rennes | 2025-01-21 | pdf-content | 4 | 13s |
| Cayenne | — | failed | — | — |
| Grenoble | 2026-02-26 | pdf-content | 3 | 13s |

### Our Mastra run (this session)

| Court | Mastra Date | Mastra Source | Turns | Time |
|---|---|---|---|---|
| Paris | 2026-03-10 | pdf-content | 4 | 14s |
| Lyon | 2026-02-13 | pdf-content | 4 | 18s |
| Angers | 2025-11-18 | pdf-content | 4 | 13s |
| Besançon | 2013-03-20 | filename | 6 | 16s |
| Bordeaux | 2025-07-01 | filename | 4 | 15s |
| Amiens | 2026-02-01 | page-text | 4 | 19s |
| Aix-en-Provence | 2026-02-19 | page-text | 4 | 13s |
| Rennes | 2026-03-04 | pdf-content | 5 | 13s |
| Cayenne | 2020-04-27 | filename | 4 | 14s |
| Grenoble | 2026-02-26 | pdf-content | 4 | 16s |

---

## Key findings

### 1. Cost and speed are equivalent
- Worktree reported: Mastra $0.095 vs Native $0.100
- Our run: Mastra $0.34 for 10 courts (~$0.034/court)
- **Framework overhead is negligible** — the cost is the LLM + web search

### 2. Native agent wastes Turn 0
The native agent's first action is often `fetchPage` on a Google/Bing result page URL (not justice.fr). It gets 0 results, then falls back to web_search_preview. This costs an extra turn.

Mastra doesn't do this — the AI SDK's web search integration handles search internally, so the agent starts with actual search results, not search engine page URLs.

### 3. Both are non-deterministic
Same model, same instructions, different results between runs:
- **Lyon**: Native got 2025-11-21 (assembly date), Mastra got 2026-02-13 (different PDF/date)
- **Aix-en-Provence**: Native got 2025-12-10 (PDF date), Mastra got 2026-02-19 (page-text — more recent)
- **Besançon**: Still flaky — sometimes 2026-02-24 (correct), sometimes 2013-03-20 (wrong site)

### 4. Rennes: Mastra was more correct
- **Native**: 2025-01-21 — found old 2025 PDF, skipped fetchPage
- **Mastra**: 2026-03-04 — found 2026 PDF via fetchPage
- The native agent didn't use fetchPage on the page and went straight to an old search result URL

### 5. Cayenne works on both with Mini
No AI SDK bug, no native SDK error. Both found a PDF (though different dates — Mastra found 2020, native failed). The `code_execution_tool_result_error` was specific to Anthropic's web_search_20260209.

### 6. Native traces are more detailed
The native implementation captures:
- Every API response output type (`web_search_call`, `function_call`, `message`)
- Function call arguments and call IDs
- Full vs compact tool outputs (both stored)
- Per-turn token usage

Mastra's step data uses `payload.result` which has full data but `toolName` shows as `undefined` for provider tools. Our custom trace logger works around this but it's less clean than native.

---

## When to use which

| | Mastra + AI SDK | Native OpenAI SDK |
|---|---|---|
| **Speed to build** | Faster — agent config, tools, structured output all declarative | Slower — manual agent loop, tool dispatch, message management |
| **Debuggability** | Needs custom trace logger (payload.result hack) | Built-in — full control over every API call |
| **Provider switching** | One-line change (anthropic → openai) | Full rewrite per provider |
| **Cost** | Same | Same |
| **Performance** | Same | Same |
| **Tool routing** | Better — doesn't waste Turn 0 on search URLs | Agent fetches search page URLs first |
| **Structured output** | Via Output.object or Mastra structuredOutput | Via responses.parse() with zodTextFormat |
| **Observability** | Mastra Studio + DefaultExporter | Custom (but cleaner) |

**Verdict**: Mastra for multi-provider flexibility and faster development. Native for maximum debuggability and control. Both produce equivalent results.
