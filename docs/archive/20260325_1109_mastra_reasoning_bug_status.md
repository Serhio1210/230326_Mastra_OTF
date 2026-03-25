# Mastra Reasoning Bug: Status as of March 25, 2026

**Date**: 2026-03-25 11:09 UTC
**Mastra version tested**: `@mastra/core@1.16.0` (latest as of this date)
**AI SDK version**: `ai@6.0.137`, `@ai-sdk/openai@3.0.48`

---

## The bug

When using a Mastra Agent (`agent.generate()`) with OpenAI's `reasoningEffort` set to anything above `"none"` and a tool that uses `web_search`, the API returns:

```
Item 'ws_...' of type 'web_search_call' was provided without its required
'reasoning' item: 'rs_...'
```

## Root cause

Mastra's agent loop manages conversation history manually — it builds the `input` array for each API turn by collecting step results. During this process, **reasoning items (prefixed `rs_`) are stripped** from the conversation history. OpenAI's Responses API requires these items to be present alongside their associated `web_search_call` items.

The request body shows `previous_response_id: undefined` — Mastra does not use OpenAI's server-side state management, which would preserve reasoning items automatically.

## What works vs what doesn't

| Setup | effort:none | effort:low | effort:medium | effort:high |
|---|---|---|---|---|
| **`generateText` directly** (AI SDK) | ✓ | ✓ | ✓ | ✓ |
| **Mastra `agent.generate()`** | ✓ | **✗ CRASH** | **✗ CRASH** | **✗ CRASH** |

The AI SDK's internal `generateText` with `maxSteps` correctly preserves reasoning items. Mastra's agent loop wrapper breaks them.

## Timeline of testing

| Date | Version | Test | Result |
|---|---|---|---|
| 2026-03-24 ~14:00 | `@mastra/core@1.15.0` | `agent.generate` + `effort:medium` + web_search | **CRASH** |
| 2026-03-24 ~14:30 | `@mastra/core@1.15.0` | `generateText` + `effort:medium` + web_search | **WORKS** |
| 2026-03-25 ~03:00 | `@mastra/core@1.15.0` | Confirmed: bug is in Mastra agent loop, not AI SDK | **Documented** |
| 2026-03-25 ~10:05 | `@mastra/core@1.16.0` | Updated to latest, retested `agent.generate` | **STILL CRASHES** |

## Two potential fixes (neither implemented by Mastra as of 1.16.0)

### Fix 1: `previousResponseId` (stateful)

OpenAI's Responses API supports `previous_response_id` — the server manages conversation state, reasoning items are preserved automatically. The AI SDK supports this parameter (`providerOptions.openai.previousResponseId`). Mastra's agent loop does not chain response IDs.

### Fix 2: Preserve reasoning items in input array (stateless)

When building the `input` array for the next turn, include the `rs_` reasoning items alongside `web_search_call` and `function_call` items. The AI SDK does this correctly in its `generateText` multi-step loop. Mastra's agent loop does not.

## Workaround

Use `generateText` directly inside a Mastra workflow `createStep`:

```typescript
const discoverStep = createStep({
  id: 'discover',
  inputSchema: z.object({ court: z.string() }),
  outputSchema: discoverResultSchema,
  execute: async ({ inputData }) => {
    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      tools: { webSearch, fetchPage },
      maxSteps: 10,
      providerOptions: { openai: { reasoningEffort: 'medium' } },
      prompt: `Find the experts page for ${inputData.court}...`,
    });
    // parse and return
  },
});
```

This gives us:
- `effort: medium` — reasoning items preserved by AI SDK
- Mastra workflow observability — step visible in Studio
- Typed input/output — Zod schemas on the step
- No Mastra Agent — bypasses the broken agent loop

## Related issues

- **Mastra GitHub #11103**: OpenAI reasoning models fail with web search
- **Mastra GitHub #7823**: Memory + LibSQLStore causes missing reasoning item (different bug, partially fixed)
- **Vercel AI SDK #7099**: reasoning items with tool calls (FIXED in AI SDK via PRs #7285, #7336, #8177)

## What to check in future Mastra releases

Look for:
- `previousResponseId` support in the agent loop
- Reasoning item preservation in `convertToAnthropicMessagesPrompt` or equivalent
- Any mention of `rs_` item handling in changelogs
