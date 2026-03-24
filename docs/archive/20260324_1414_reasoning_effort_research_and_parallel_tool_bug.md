# Reasoning Effort Research & Parallel Tool Call Bug

**Date**: 2026-03-24 14:14 UTC

---

## Should we increase reasoning effort?

**Yes — for the right steps.** Research from March 2026 shows:

### Adaptive Reasoning (Ares paper, arxiv 2603.07915)
- Not every step needs the same reasoning depth
- A router that picks minimum effort per step reduces tokens by 52.7% with minimal quality loss
- Search/fetch steps need zero reasoning. Date interpretation needs more.

### Sonnet 4.6 in production (Resolve.ai)
- **Medium effort with adaptive thinking** came "surprisingly close to Opus 4.6 on hardest investigations, at a fraction of the cost"
- High effort adds ~40% latency and ~5 additional tool calls
- Recommendation: **"Start with medium and adjust from there"**
- We've been running at `low` — under-thinking for date interpretation

### GPT-5.4 practical guidance (NxCode)
- `none`/`low` — high-throughput, formatting, lookups
- **`medium`** — "the right default for most applications"
- **`high`** — "batch processing, document analysis, data extraction" ← our use case
- `xhigh` — correctness-critical

---

## The parallel tool call + reasoning bug

### What we saw
When setting `reasoning.effort: "medium"` on GPT-5.4 Mini with web search, all courts failed:
```
web_search_call was provided without its required 'reasoning' item
```

### Root cause (NOT an SDK bug, NOT an API bug)
It's a **message ordering issue**. When reasoning is enabled and the model makes parallel tool calls, the conversation history must be:

```
✓ CORRECT:  reasoning → [call1, call2, call3] → [output1, output2, output3]
✗ WRONG:    reasoning → call1 → output1 → call2 → output2 → call3 → output3
```

OpenAI's Responses API requires all calls grouped, then all outputs grouped. SDKs (Vercel AI SDK, LangChain, Mastra) all interleave calls and outputs. This works at `effort: "none"` (no reasoning items) but breaks when reasoning is enabled.

### Status as of March 2026
- **OpenAI's API**: works as designed — not a bug
- **@ai-sdk/openai**: not fixed — interleaves calls and outputs
- **LangChain/LangGraph**: same issue reported
- **Mastra**: same issue reported (GitHub #11103)
- **Workaround 1**: use `previous_response_id` (let OpenAI manage state server-side)
- **Workaround 2**: manually reorder conversation history before sending
- **Workaround 3**: keep `effort: "none"` on steps with tools

### Impact on our architecture
The bug only triggers when: reasoning enabled + parallel tool calls + multi-turn.

Our **extraction step** (Step 2) has NO tools — just a clean prompt → structured output. So we CAN safely use reasoning effort on it.

---

## Plan: split effort levels

| Step | Tools? | Effort | Why |
|---|---|---|---|
| Agent (Step 1) | Yes (web search, fetchPage, extractPdfDate) | `none` | Parallel tool bug prevents reasoning |
| Extraction (Step 2) | No | `medium` | Date interpretation benefits from reasoning |

This gives us reasoning where it matters most (picking the best date from multiple signals) without triggering the parallel tool bug.

Sources:
- [Ares: Adaptive Reasoning Effort Selection](https://arxiv.org/abs/2603.07915)
- [Resolve.ai: Testing Sonnet 4.6 on Production Agents](https://resolve.ai/blog/Our-early-impressions-of-Claude-Sonnet-4.6)
- [OpenAI: The Real Issue with reasoning items](https://community.openai.com/t/openai-api-error-function-call-was-provided-without-its-required-reasoning-item-the-real-issue/1355347)
- [LangGraph: 400 Error web_search_call without reasoning](https://forum.langchain.com/t/langgraph-openai-responses-api-400-error-web-search-call-was-provided-without-its-required-reasoning-item/1740)
- [Mastra: OpenAI reasoning models fail](https://github.com/mastra-ai/mastra/issues/11103)
