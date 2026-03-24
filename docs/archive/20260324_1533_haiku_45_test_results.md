# Haiku 4.5 Test: Paris Results

**Date**: 2026-03-24 15:33 UTC

---

## Configuration

- **Model**: `claude-haiku-4-5`
- **Web search**: `webSearch_20250305` (NOT `20260209` — see below)
- **Domain filtering**: `allowedDomains: ["justice.fr", "gouv.fr"]`
- **Location**: France/Paris
- **Agent reasoning**: default (no effort param — not supported on Haiku)
- **Extraction reasoning**: `thinking: { type: "enabled", budgetTokens: 5000 }`

## Two compatibility issues discovered

### 1. `effort` parameter not supported on Haiku 4.5

Anthropic's effort parameter only works on:
- Claude Opus 4.6
- Claude Sonnet 4.6
- Claude Opus 4.5

**Haiku 4.5 is NOT supported.** Must use `thinking: { type: "enabled", budgetTokens: N }` instead for reasoning control.

### 2. `webSearch_20260209` not supported on Haiku 4.5

Error: `'claude-haiku-4-5-20251001' does not support programmatic tool calling`

`web_search_20260209` uses programmatic tool calling internally (for dynamic filtering). Haiku 4.5 doesn't support programmatic tool calling. Must use `webSearch_20250305` (older version, no dynamic filtering).

**This means no dynamic filtering on Haiku** — search results go straight into context unpruned, causing massive token usage.

## Results: Paris

| Metric | Value |
|---|---|
| Date | 2026-03-10 (correct) |
| Source | pdf-content |
| Total time | 38.5s |
| Agent input tokens | **281,854** |
| Extraction tokens | 3,594 in / 982 out |
| **Total cost** | **$0.29** |

## Cost comparison: same court (Paris)

| Model | Input tokens | Cost | Time | Correct? |
|---|---|---|---|---|
| GPT-5.4 Mini | 26,532 | **$0.03** | 16s | Yes |
| Sonnet 4.6 | ~40,000 | $0.70 | 82s | Yes |
| **Haiku 4.5** | **285,448** | **$0.29** | 38.5s | Yes |

## Why Haiku is 10x more tokens than Mini

1. **No dynamic filtering** — `webSearch_20250305` dumps all raw search results into context. `web_search_20260209` (Sonnet) and OpenAI's `web_search` prune results with code execution before they hit context.
2. **Web search result size** — Anthropic's web search returns full page snippets. Without dynamic filtering, all snippets stay in context (~90k tokens per search round).
3. **3 search rounds** — The agent searched multiple times, accumulating ~280k input tokens.

## Domain filtering worked

The `allowedDomains: ["justice.fr", "gouv.fr"]` successfully restricted search to official government sites. The agent found the correct `cours-appel.justice.fr/paris/experts-judiciaires` page directly — no third-party sites.

## Conclusion

Haiku 4.5 produces correct results but is **not cost-effective for this use case** because:
- Can't use `web_search_20260209` (no programmatic tool calling) → no dynamic filtering → massive token usage
- Can't use `effort` parameter → less control over reasoning depth
- $0.29/court vs $0.03/court with Mini → 10x more expensive

Haiku 4.5 would only make sense if:
- Dynamic filtering support is added (future update?)
- We skip web search entirely (use known URLs)
- The extraction-only step (no search, no tools) where Haiku's $1/1M input is competitive
