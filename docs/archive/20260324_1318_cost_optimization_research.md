# Cost Optimization Research

**Date**: 2026-03-24 13:18 UTC

---

## Current cost: ~$0.70 per court

Our agent runs ~$50 total for ~70 runs during development (including experiments and retries).
Production cost estimated at $0.50-0.70 per court, meaning a full 36-court sweep costs ~$18-25.

---

## Model pricing comparison (March 2026)

| Model | Input/1M | Output/1M | ~Cost per court | Notes |
|---|---|---|---|---|
| **Sonnet 4.6** (current) | $3.00 | $15.00 | ~$0.70 | Reliable. Proven. |
| **Sonnet 4.6 Batch** | $1.50 | $7.50 | N/A | Can't batch agent loops (see below) |
| **GPT-5.4** | $2.50 | $15.00 | ~$0.63 | Structured output bugs with 5.* series |
| **GPT-5.4 Mini** | $0.75 | $4.50 | ~$0.15 | 4x cheaper. 93.4% tool use score. |
| **Haiku 4.5** | $0.80 | $4.00 | ~$0.16 | Similar to Mini. Proven in our tests. |
| **Haiku 4.5 Batch** | $0.50 | $2.50 | ~$0.08 | Cheapest option if batching extraction |

---

## GPT-5.4 structured output issues

The GPT-5.* series has known structured output problems:

- **GPT-5.4 full**: Sometimes returns analysis as a JSON-encoded string instead of a structured object. [Bug reported on GitHub](https://github.com/agno-agi/agno/issues/4183).
- **GPT-5-chat variant**: Doesn't support structured output at all. Model Router may silently pick it.
- **GPT-5.4 Mini**: Actually better — 93.4% on tool use benchmarks. Reliable schema adherence.
- **Schema quirks**: OpenAI requires `.nullable()` instead of `.optional()` or `.nullish()` in Zod schemas. Different from Anthropic.

**Recommendation**: Don't switch to GPT-5.4 for extraction. The bugs and minimal price difference ($0.07/court) aren't worth the risk.

---

## GPT-5.4 Mini effort settings

Mini supports reasoning effort: `none`, `low`, `medium`, `high` (no `xhigh` — that's full GPT-5.4 only).

For extraction tasks, `none` or `low` would work — it's mechanical field-filling, no reasoning needed.

---

## Anthropic Batch API: doesn't help our architecture

### What batch supports
- Tool use (including web search)
- Structured output
- Vision, multi-turn, system messages
- 50% discount on all token costs
- Up to 100,000 requests per batch
- Most batches complete within 1 hour

### Batch pricing (Sonnet 4.6)

| | Standard | Batch |
|---|---|---|
| Input | $3.00/1M | $1.50/1M |
| Output | $15.00/1M | $7.50/1M |

### Why it doesn't work for our agent

Each batch request is a **single Messages API call** — one request, one response. Our agent requires **multiple round-trips**:

```
Call 1: web search → response with tool call
Call 2: agent sees results → calls fetchPage
Call 3: agent sees page → calls extractPdfDate
Call 4: agent sees PDF → responds with findings
```

This is a multi-step loop (4+ turns). The batch API can't execute agent loops — it can only process independent single-turn requests.

### What we COULD batch

**Step 2 (extraction)** is a single call: clean prompt → structured output. We could:
1. Run all 36 agents normally (Step 1) — collect summaries
2. Batch all 36 extraction calls (Step 2) — 50% off

But the extraction step is only ~$0.05/court. Saving 50% = $0.025/court = $0.90 total for 36 courts. Not significant.

---

## Where the real cost optimization is

### Option A: Cheaper model for Step 1 (agent)

The agent step is 90% of the cost (~$0.65 of the $0.70). Using Haiku 4.5 or GPT-5.4 Mini for the agent would save the most, but we'd need to test if they're smart enough to:
- Pick the right URLs from search results
- Choose the correct PDF from fetchPage results
- Handle legacy site fallbacks

### Option B: Reduce agent steps

The agent currently does 3-5 tool calls per court. If we could pre-compute the court page URLs (they follow predictable patterns like `cours-appel.justice.fr/[city]/experts-judiciaires`), we could skip the web search entirely and go straight to fetchPage. That eliminates 1-2 LLM turns + web search costs ($0.01-0.03/search).

### Option C: Deterministic pipeline (no agent for known courts)

For courts we've already found, we know the exact URL. We could:
1. fetchPage directly (no LLM needed)
2. extractPdfDate directly (no LLM needed)
3. Only use the LLM for date interpretation from the PDF text

This would reduce cost to nearly zero for repeat runs — just one small LLM call for date parsing.

---

## Summary

| Strategy | Saving | Effort | Risk |
|---|---|---|---|
| Switch extraction to Haiku | ~$0.03/court | Low (1 line change) | Low (proven) |
| Batch extraction calls | ~$0.025/court | Medium (new API) | Low |
| Switch agent to Haiku/Mini | ~$0.50/court | Medium (needs testing) | Medium (quality?) |
| Skip web search for known URLs | ~$0.10/court | Medium | Low |
| Full deterministic pipeline | ~$0.65/court | High (rebuild) | Low (no LLM reasoning) |

The biggest win is either switching the agent to a cheaper model (needs testing) or going deterministic for known courts (needs rebuild).
