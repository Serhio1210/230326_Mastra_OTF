# Full Chat Session Summary

**Date**: 2026-03-25 02:25 UTC
**Duration**: ~20 hours of building, testing, and researching

---

## Setup
- Created repo `230326_Mastra_OTF` with Bun + Hono + Mastra
- Researched Docker in VirtualBuddy VMs (M4 Pro), OrbStack, Apple Containers
- Researched which SDK (Anthropic/OpenAI/Gemini) is best for web search agents in Mastra

## Agent v1 — Anthropic web search
- Built agent with `claude-sonnet-4-6` + `webSearch_20250305`
- Discovered `webSearch_20260209` already existed in AI SDK (docs lagged behind code)
- Upgraded to `webSearch_20260209` with dynamic filtering — 24% fewer tokens

## Structured output
- Added Zod schema (`ExpertFinderResult`) with structured output on `agent.generate()`
- Discovered the 2-step structuring problem (tools + structured output conflict)
- Researched Mastra internals — read actual source code of `StructuredOutputProcessor`
- Documented three modes: `outputFormat` (native), `jsonTool` (hack), `auto`

## Tools — fetchPage + extractPdfDate
- Built `fetchPage` (cheerio HTML parsing) — found March 2026 PDF that web search missed
- Built `extractPdfDate` (unpdf, 5 pages) — reads official date from PDF content
- Added `toModelOutput` on both tools to reduce context for the agent
- Added `TokenLimiter` processor

## Structuring problems & solutions
- Sonnet garbled output when structuring from long conversation history (context rot)
- Tried `jsonPromptInjection` — produced undefined
- Tried `prepareStep` — broke structured output
- Haiku 4.5 works for structuring (mechanical extraction)
- **Clean prompt approach** — agent gathers data, separate call extracts with native structured output — works perfectly

## Date priority chain
- Initially: "PDF content is always truth" — too rigid
- Ground truth testing revealed: some PDFs only say "POUR L'ANNEE 2026" (no exact date)
- Corrected: most specific and most recent date wins, regardless of source
- PDF exact date > page text > link text > filename/URL path > year only

## 36-court batch testing (Sonnet)
- 35/36 pass (97.2%) — Cayenne failed due to `@ai-sdk/anthropic` bug parsing `code_execution_tool_result_error`
- ~$0.70/court, ~60s/court

## GPT-5.4 Mini experiment
- 36/36 pass (100%), $0.026/court (27x cheaper), 12s (5x faster)
- 56% exact date match with Sonnet at `effort: "none"` (default)
- GPT-5.4 full was worse than Mini — over-reasons, returns nulls
- Cayenne passed with Mini (different web search provider, no SDK bug)

## Reasoning effort research
- `effort: "medium"` on agent step crashes — parallel tool call + reasoning item ordering bug
- Not an API bug — SDKs interleave calls/outputs instead of grouping them
- **Split effort breakthrough**: agent at `none` (has tools) + extraction at `medium` (no tools)
- Result: 5/6 divergent courts now match ground truth for $0.001 extra per court
- Discovered `previous_response_id` could bypass the bug entirely (not tested yet)

## SDK bugs found
1. `@ai-sdk/anthropic` — can't parse `code_execution_tool_result_error` from dynamic filtering
2. `@ai-sdk/openai` — strips reasoning items needed by parallel tool calls when effort > none

## Key numbers

| Config | Cost/court | Time | Success | Accuracy |
|---|---|---|---|---|
| Sonnet 4.6 | $0.70 | 60s | 35/36 | Good but hallucinated Lyon |
| Mini none/none | $0.026 | 12s | 36/36 | 56% match |
| **Mini none/medium** | **$0.027** | **15s** | **36/36** | **5/6 ground truth** |

## Documentation
- 17+ timestamped docs in `docs/archive/`
- Reference data saved (`courts-verified.json` from production app)
- CLAUDE.md with project conventions

## Key insights
1. **PDF content is the official truth** — but only when it has an exact date. Year-only is not authoritative.
2. **Web search indexes lag** — always fetch the actual page for the latest PDF.
3. **Clean prompts beat long conversations** — for extraction, give the model only what it needs.
4. **Smaller models can be better** — Mini at $0.027 outperforms Sonnet at $0.70 on success rate.
5. **Split reasoning effort** — none on agent (bug), medium on extraction (reasoning helps).
6. **toModelOutput is essential** — reduces context rot, keeps agent focused.
7. **Check the CHANGELOG, not just the docs** — features ship before documentation.
8. **Ground truth matters** — comparing models against each other is meaningless without verifying who is actually correct.
9. **The bug is in the ordering, not the API** — parallel tool calls + reasoning requires grouped calls then grouped outputs. All SDKs get this wrong.
10. **GPT-5.4 full is worse than Mini for extraction** — bigger model ≠ better results for mechanical tasks.
