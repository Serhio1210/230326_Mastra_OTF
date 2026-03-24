# Raw Data + Medium Reasoning: Results

**Date**: 2026-03-24 14:30 UTC

---

## What changed

Two improvements applied together:

1. **Raw tool data to extraction** — extraction LLM receives page text, all PDF URLs, PDF content directly from `payload.result` (not just the agent's summary)
2. **Medium reasoning on extraction** — `reasoningEffort: "medium"` on the extraction step (no tools = no parallel tool bug)

## Key discovery: `payload.result` has the full data

Mastra wraps tool results in a `payload` object. The full `execute` data is at `tr.payload.result`, NOT `tr.result`:

```typescript
for (const tr of step.toolResults || []) {
  const p = (tr as any).payload;
  // p.toolName → "fetchPage"
  // p.result.pageText → full page text (2266 chars)
  // p.result.pdfLinks → all PDF links (3 items)
}
```

This means `toModelOutput` works correctly: the model sees compact data during reasoning, but the application can access the full data from the step history.

## Results: 6 divergent courts

| Court | Old Mini (none, summary) | New Mini (medium, raw) | Ground truth | Improved? |
|---|---|---|---|---|
| Paris | 2026-03-10 | 2026-03-10 (pdf-content) | 2026-03-10 | Same (correct) |
| Lyon | 2025-11-21 | 2025-11-21 (pdf-content) | 2025-11-21 | Same (correct) |
| **Angers** | 2025-11-18 | **2026-03-20 (page-text)** | 2026-03-20 | **Fixed** — picks page date over old assembly date |
| Besançon | 2013-03-20 | 2023-11-23 (filename) | ~2026-02-24 | Improved (2013→2023) but still wrong site |
| Bordeaux | 2025-01-01 | 2025-01-01 (pdf-content) | ~2025-07 | Same — agent finds old PDF |
| Amiens | 2022-12-05 | 2022-12-05 (pdf-content) | ~2026-02 | Same — agent finds old PDF |

## Analysis

### What medium reasoning fixed: Angers
The extraction LLM reasoned: *"page text 'mise à jour : 20/03/2026' is more recent than the PDF's assembly date '18 novembre 2025'"*. This is exactly the smart fallback we wanted — the LLM compared dates across sources and picked the most recent/specific one.

### What raw data didn't fix: Bordeaux, Amiens
These courts' problems are in the **agent step**, not the extraction step. The agent found old/wrong PDFs. No amount of reasoning on the extraction step can fix data the agent didn't collect.

### Where the real improvement needs to happen
The remaining divergence is caused by OpenAI web search finding different (older) pages than Anthropic web search. This is a search engine quality difference, not a model or reasoning issue.

## Architecture confirmed

```
Agent (effort: none, tools)  → discovers page, fetches HTML, reads PDF
  ↓ raw data via payload.result
Extraction (effort: medium, no tools)  → analyzes ALL date signals, picks best
```

This is the right split. The extraction step now correctly reasons about page-text vs PDF-content vs URL-path dates. The remaining gap is in what the agent finds, not how the extraction interprets it.
