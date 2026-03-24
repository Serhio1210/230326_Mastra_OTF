# Native OpenAI SDK vs Mastra+AI SDK Comparison

**Date**: 2026-03-24 21:57 UTC
**Branch**: `worktree-native-openai-sdk`

---

## What we did

We implemented the same court search agent using the **native OpenAI SDK** (`openai@6.32.0`, Responses API) — no Mastra, no Vercel AI SDK — and ran it side-by-side against the existing **Mastra + `@ai-sdk/openai`** implementation on 10 French courts. Both use the same model (`gpt-5.4-mini`), same instructions, same tool logic (fetchPage via cheerio, extractPdfDate via unpdf), and the same 2-step architecture (agent loop → structured extraction). The native version records a full trace of every API turn: which output items came back (web_search_call, function_call, message), what arguments the model chose, the full tool results, per-turn token usage, and timing. We saved per-court trace JSON files and a comparison summary.

## Architecture

### Mastra + AI SDK (existing)
```
Mastra Agent (agent.generate, maxSteps: 15)
  → @ai-sdk/openai wraps openai.tools.webSearch()
  → Mastra createTool with toModelOutput compaction
  → AI SDK generateText + Output.object for extraction
```

### Native OpenAI SDK (new)
```
Manual agent loop (responses.create, max 15 turns)
  → { type: "web_search_preview" } built-in tool
  → { type: "function" } with JSON Schema params
  → Manual function_call_output with compact strings
  → responses.parse + zodTextFormat for extraction

Full trace recorded: every turn, tool call, result, tokens, timing
```

## Results: 7/10 agree, 3 diverge

| Court | Mastra Date | Native Date | Match | M-Src | N-Src | M-Time | N-Time | N-Turns | M-Cost | N-Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| Paris | 2026-01-28 | 2026-03-10 | ✗ | pdf-content | page-text | 11.4s | 14.3s | 3 | $0.006 | $0.008 |
| Lyon | 2026-02-13 | 2026-02-13 | ✓ | pdf-content | pdf-content | 17.4s | 17.0s | 4 | $0.009 | $0.009 |
| Angers | 2025-11-18 | 2025-11-18 | ✓ | pdf-content | pdf-content | 14.5s | 16.4s | 4 | $0.009 | $0.012 |
| Besançon | 2026-02-24 | 2026-02-24 | ✓ | page-text | page-text | 10.4s | 13.0s | 4 | $0.005 | $0.007 |
| Bordeaux | 2025-07-01 | 2025-07-01 | ✓ | filename | filename | 19.5s | 18.1s | 5 | $0.011 | $0.011 |
| Amiens | 2026-02-01 | 2026-02-01 | ✓ | page-text | page-text | 22.9s | 16.2s | 4 | $0.013 | $0.009 |
| Aix-en-Provence | 2025-12-10 | 2025-12-10 | ✓ | pdf-content | pdf-content | 15.2s | 16.2s | 3 | $0.008 | $0.009 |
| Rennes | 2026-03-04 | 2025-01-21 | ✗ | pdf-content | pdf-content | 16.2s | 21.6s | 3 | $0.008 | $0.014 |
| Cayenne | 2026-03-01 | null | ✗ | filename | not-found | 27.2s | 15.6s | 5 | $0.016 | $0.010 |
| Grenoble | 2026-02-26 | 2026-02-26 | ✓ | pdf-content | pdf-content | 14.3s | 15.9s | 5 | $0.010 | $0.010 |

**Totals**: Mastra $0.095 / 169s | Native $0.100 / 164s

## Divergence analysis

### Paris — Native found newer PDF ✓
- **Mastra** found the January PDF (`ANNUPARIS MAJ 28 janv 26_0.pdf`) → date 2026-01-28
- **Native** found the March PDF (`ANNUPARIS MAJ 10 MARS 26_2.pdf`) → date 2026-03-10
- The page itself says "mise à jour : 10/03/2026" — **native is more correct**
- Difference is in which PDF the web search / agent selected

### Rennes — Mastra found 2026 PDF ✓
- **Mastra** found the 2026 expert list → "mise à jour au 4 mars 2026" → 2026-03-04
- **Native** found the 2025 expert list → "mise à jour au 21 janvier 2025" → 2025-01-21
- Trace shows native skipped fetchPage and went straight to extractPdfDate on an older URL from search results
- **Mastra is correct** — there's a 2026 version available

### Cayenne — Mastra succeeded, Native failed
- **Mastra** found a PDF in `/2026-03/` and extracted date from filename
- **Native** couldn't find the experts page, tried Fort-de-France, then the Cayenne homepage, got no expert PDFs
- Note: the old AI SDK Zod crash on Cayenne did NOT occur in this run — both handled gracefully

## Key behavioral finding: wasted Turn 0

The native agent wastes its first turn trying to `fetchPage` on Google/Bing search URLs (e.g. `https://www.google.com/search?q=...`). This always returns 0 PDFs because Google's search page doesn't contain direct PDF links. The agent then falls back to `web_search_preview` on Turn 1.

This happened on **every single court** — it's a systematic behavior. The Mastra version doesn't exhibit this, suggesting either:
1. Mastra/AI SDK routes the web search tool differently
2. The AI SDK wrapper presents web search in a way that the model prefers to use it first
3. Mastra's tool integration changes the model's behavior around tool selection

This costs ~5K tokens and 2-3 seconds per court for no benefit.

## What the trace system captures

For each court, the native implementation records:
- **Per-turn**: timestamp, duration, API output item types, token usage
- **Per-event**: web_search calls (with ID), function_calls (with name + args + callId), function_results (compact output + full raw result + duration), model text output
- **Extraction step**: full prompt sent, structured result, usage
- **Raw tool data**: page title, page text, PDF links, PDF text, date hints

All traces saved as JSON in `docs/archive/trace-{court}-*.json`.

## Files

- `src/lib/run-court-search-native.ts` — Native OpenAI SDK implementation with full trace
- `src/tests/22-native-single-test.ts` — Single-court test with trace printout
- `src/tests/22-native-vs-mastra-comparison.ts` — 10-court comparison runner
- `docs/archive/comparison-summary-2026-03-24T21-57-19.json` — Structured comparison data
- `docs/archive/trace-{court}-2026-03-24T21-57-19.json` — Full traces (10 files)
