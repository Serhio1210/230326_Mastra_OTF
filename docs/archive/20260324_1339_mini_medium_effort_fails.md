# GPT-5.4 Mini: reasoning.effort "medium" Breaks Web Search

**Date**: 2026-03-24 13:39 UTC

---

## What happened

When setting `reasoning.effort: "medium"` on GPT-5.4 Mini with web search, **all 5 courts failed** with:

```
web_search_call was provided without its required 'reasoning' item
```

## Root cause

When reasoning is enabled (anything above `none`), OpenAI's API generates a `reasoning` item before each `web_search_call`. On multi-turn conversations, the API requires these reasoning items to be sent back alongside the web search results.

The AI SDK (`@ai-sdk/openai`) strips these reasoning items when constructing the follow-up request — so the API rejects it because the `web_search_call` is orphaned from its `reasoning` item.

## Impact

**GPT-5.4 Mini with web search only works at `effort: "none"`** (no reasoning). Any reasoning effort (`low`, `medium`, `high`) breaks the multi-turn web search flow.

This is an `@ai-sdk/openai` bug — it doesn't preserve reasoning items in the conversation history for OpenAI's Responses API.

## Comparison of SDK bugs discovered

| Provider | Bug | Impact |
|---|---|---|
| `@ai-sdk/anthropic` | Can't parse `code_execution_tool_result_error` from `web_search_20260209` | Cayenne fails with Sonnet |
| `@ai-sdk/openai` | Strips reasoning items needed by `web_search_call` when effort > none | All courts fail with Mini + reasoning |

Both bugs are in the AI SDK's handling of provider-specific multi-turn conversation formats, not in our agent code.

## Conclusion

GPT-5.4 Mini at `effort: "none"` remains the best cost option:
- 36/36 pass, $0.026/court, 12s average
- Can't improve accuracy via reasoning due to SDK bug
- The 56% date match with Sonnet is what we get — further improvement needs a different approach (better prompting, not more reasoning)
