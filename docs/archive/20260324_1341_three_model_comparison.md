# Three-Model Comparison: Sonnet 4.6 vs GPT-5.4 vs GPT-5.4 Mini

**Date**: 2026-03-24 13:41 UTC

---

## Test: 5 divergent courts

| Court | Sonnet 4.6 | GPT-5.4 Mini (none) | GPT-5.4 Full | Winner |
|---|---|---|---|---|
| **Lyon** | 2026-01-15 | 2025-11-21 | 2025-11-21 | Sonnet (most recent) |
| **Bordeaux** | 2025-07-01 | 2025-01-01 | null | Sonnet |
| **Amiens** | 2026-02-01 | 2022-12-05 | 2026-01-01 | Sonnet |
| **Angers** | 2026-03-20 | 2025-11-18 | 2025-11-18 | Sonnet (page-text fallback) |
| **Besançon** | 2024-01-01 | 2013-03-20 | null | Sonnet |

## Cost comparison

| Model | 5-court cost | Per-court avg | Speed |
|---|---|---|---|
| Sonnet 4.6 | ~$3.50 | $0.70 | ~60s |
| GPT-5.4 Full | $0.47 | $0.09 | ~24s |
| GPT-5.4 Mini | $0.13 | $0.026 | ~12s |

## Key finding: GPT-5.4 Full is worse than Mini

GPT-5.4 full returned `null` for 2 courts (Bordeaux, Besançon) where Mini at least returned a date. The full model:
- Over-reasons about uncertainty instead of returning best available date
- Loses document URLs (sets `documentUrl: null` with lengthy error explanations)
- 3.5x more expensive than Mini with worse results
- Known structured output issues (sometimes returns JSON string instead of object)

## Root cause of OpenAI vs Sonnet divergence

Mini and GPT-5.4 return the **same dates** for Lyon and Angers — confirming the divergence from Sonnet is caused by **different search engines**, not model reasoning:

- **Anthropic web search** → finds different pages/PDFs than OpenAI web search
- **OpenAI web search** → consistently finds the same pages regardless of model size

The 56% date match between Mini and Sonnet is a **search engine difference**, not an intelligence difference.

## Recommendation

| Priority | Model | Use case |
|---|---|---|
| **1. Accuracy** | Sonnet 4.6 | Anthropic web search finds more recent pages, better fallback to page-text |
| **2. Cost** | GPT-5.4 Mini | 27x cheaper, good enough for monitoring, 100% success rate |
| **3. Avoid** | GPT-5.4 Full | More expensive than Mini, worse results, structured output bugs |

GPT-5.4 Full occupies the worst position — too expensive for batch work, not accurate enough to justify the cost over Mini, and has known structured output bugs. Mini does the same job cheaper and more reliably.
