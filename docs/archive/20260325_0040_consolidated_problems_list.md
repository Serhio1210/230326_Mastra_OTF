# Consolidated Problems List

**Date**: 2026-03-25 00:40 UTC
**Session**: ~12 hours of building and testing

---

## Model & API problems

| # | Problem | Severity | Status | Where discovered |
|---|---|---|---|---|
| 1 | **Model ID wrong** — `claude-sonnet-4-5-20250514` → 404 | Low | Fixed (`20250929`, then `4-6`) | Main branch |
| 2 | **`web_search_20260209` assumed missing** — AI SDK docs outdated | Medium | Fixed (found in CHANGELOG) | Main branch |
| 14 | **Cayenne: `@ai-sdk/anthropic` can't parse `code_execution_tool_result_error`** from dynamic filtering | Medium | Unresolved (SDK bug) | Main branch, Sonnet only |
| 15 | **Rate limit** — 2M tokens/min hit with 5 concurrent Anthropic courts | Low | Sequential retry | Main branch |
| 16 | **Haiku 4.5 doesn't support `effort` parameter** — only Opus 4.6, Sonnet 4.6, Opus 4.5 | Medium | Use `thinking: { budgetTokens }` instead | Haiku test |
| 17 | **Haiku 4.5 doesn't support `webSearch_20260209`** — no programmatic tool calling | **High** | Must use `webSearch_20250305` (no dynamic filtering) | Haiku test |
| 18 | **Haiku without dynamic filtering = 285k input tokens** — $0.29/court vs $0.03 with Mini | **High** | Don't use Haiku for web search agents | Haiku test |
| 20 | **GPT-5.4 full overthinks extraction at high effort** — 2/10 agreement with Mini | Medium | Set extraction effort to `low` | Worktree |
| 21 | **Extraction effort should be LOW not HIGH** — low→9/10 agreement, high→2/10 | **Key insight** | Always use low effort for extraction | Worktree |

## Mastra framework problems

| # | Problem | Severity | Status | Where discovered |
|---|---|---|---|---|
| 5 | **Structured output + tools conflict** — Sonnet garbled `courtName` with reasoning text | **High** | Fixed (separate extraction call) | Main branch |
| 6 | **Context rot** — Sonnet received 40k+ tokens for structuring, picked wrong values | **High** | Fixed (clean prompt approach) | Main branch |
| 7 | **Structuring timeout** — Sonnet timed out at 180s and 300s | **High** | Fixed (toModelOutput + clean prompt) | Main branch |
| 8 | **`toModelOutput` too aggressive** — agent couldn't see PDF URLs | Medium | Fixed (show all PDFs, drop pageText) | Main branch |
| 9 | **`prepareStep` broke structured output** — returned null | Medium | Abandoned | Main branch |
| 10 | **`jsonPromptInjection: true`** — produced `undefined` with Anthropic | Medium | Don't use with Anthropic | Main branch |
| 11 | **Default structuring instructions too generic** | Low | Fixed (custom `instructions`) | Main branch |
| — | **`toolName: undefined`** for provider tools in step history | Medium | Read from `payload.toolName` | Main branch |
| — | **Full tool data hidden** — data at undocumented `tr.payload.result` | Medium | Discovered by inspecting objects | Main branch |
| — | **ConsoleExporter too noisy** — dumps full OpenTelemetry spans | Low | Built custom trace logger | Main branch |

## OpenAI SDK problems

| # | Problem | Severity | Status | Where discovered |
|---|---|---|---|---|
| — | **`reasoning.effort` + web search = parallel tool bug** — `web_search_call provided without reasoning item` | **High** | Only use `effort: none` on agent step with tools | Main branch |
| — | **GPT-5.4 structured output bugs** — sometimes returns JSON string instead of object | Medium | Use Mini instead | Main branch |
| — | **Native agent wastes Turn 0** — fetches Google/Bing search URLs before using web_search | Medium | Fixed with `allowed_domains` filter | Worktree |

## Agent behaviour problems

| # | Problem | Severity | Status | Where discovered |
|---|---|---|---|---|
| 3 | **Web search returns stale data** — Jan 2025 PDF when page had March 2026 update | **High** | Fixed (added fetchPage tool) | Main branch |
| 4 | **Date priority chain backwards** — page-text over PDF content | Medium | Reversed (PDF content primary, smart fallback) | Main branch |
| 12 | **No effort/thinking settings configured** — using defaults | Low | Fixed | Main branch |
| 13 | **Besançon legacy site dead** — `ca-besancon.justice.fr` inaccessible | Medium | Modern site now works (search-first instructions) | Main branch |
| — | **Agent constructs URLs instead of searching** — guesses `cours-appel.justice.fr/[city]` (missing www.) | **High** | Fixed (instructions: "never construct URLs") | Main branch |
| 19 | **`allowed_domains` dramatically improves results** — Paris, Besançon, Rennes all fixed | **Key insight** | Applied to all agents | Worktree |

---

## Key insights (not problems, but critical learnings)

| Insight | Impact |
|---|---|
| **PDF content is the official truth** — but only when it has an exact date | Changed priority chain |
| **Year-only PDF dates must not override exact dates from other sources** | Changed extraction logic |
| **Clean prompt beats conversation history** for structured extraction | Changed architecture |
| **`toModelOutput` reduces agent context but `buildStructuringPrompt` uses raw stream** | Bypassed Mastra's structuredOutput |
| **`allowed_domains` filter is the single highest-impact improvement** | Applied everywhere |
| **Low extraction effort > high extraction effort** — models overthink at high | Changed all extraction configs |
| **Mastra and native SDK produce identical API calls** (verified from source) | Framework choice is about DX, not performance |
| **Haiku 4.5 is the most limited model for agent work** — no effort, no dynamic filtering, no programmatic tools | Don't use Haiku for search agents |
| **Search non-determinism is the remaining unsolved problem** — same court gives different results between runs | Need retry logic or URL caching |

---

## Problems by provider

### Anthropic (8 problems)
- Model ID, web search version, structured output garbling, context rot, timeout, jsonPromptInjection, Cayenne SDK bug, rate limit

### OpenAI (3 problems)
- Reasoning + parallel tool bug, GPT-5.4 structured output bugs, Turn 0 waste

### Mastra framework (10 problems)
- structuredOutput conflicts, prepareStep, toModelOutput, payload.result hack, toolName undefined, ConsoleExporter noise, default instructions

### Agent behaviour (6 problems)
- Stale search data, date priority, URL guessing, Besançon, allowed_domains, effort settings

**Total: 27 distinct problems discovered across ~12 hours of work.**
