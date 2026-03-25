# The Reasoning Bug is in Mastra, Not the AI SDK

**Date**: 2026-03-25 02:18 UTC

---

## Discovery

We tested `reasoning.effort: "medium"` + `web_search` + multi-step in two ways:

### Direct `generateText` — WORKS

```typescript
const result = await generateText({
  model: openai('gpt-5.4-mini'),
  tools: { webSearch: openai.tools.webSearch({ ... }) },
  maxSteps: 5,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
  prompt: 'Search for...',
});
// SUCCESS — no crash
```

### Mastra `agent.generate` — FAILS

```typescript
const agent = mastra.getAgent('expert-search-mini');
const result = await agent.generate('Search for...', {
  maxSteps: 10,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
});
// CRASH: web_search_call provided without its required reasoning item
```

## Root cause

The AI SDK's `generateText` with `maxSteps` correctly preserves reasoning items in its internal multi-step loop. The fix was in PRs #7285, #7336, #8177 which are included in our `ai@6.0.137`.

**Mastra wraps its own agent loop** around `generateText`. It intercepts the step results, processes them through its processor pipeline, and builds the next request's `input` array manually. In doing so, it **strips the reasoning items** that OpenAI requires to be passed back.

The proof is in the error response — the request body shows:
- `previous_response_id: undefined` — Mastra doesn't use stateful conversations
- `input: [8 items]` — manually constructed, missing reasoning items
- `reasoning: { effort: "medium" }` — reasoning is requested but items aren't preserved

## Solutions

### Solution 1: Use `generateText` directly (bypass Mastra Agent)

Build our own agent loop with `generateText` + `maxSteps`. The AI SDK handles reasoning items correctly. This is essentially what the worktree's native SDK does, but using the AI SDK instead of the raw OpenAI SDK.

```typescript
const result = await generateText({
  model: openai('gpt-5.4-mini'),
  tools: { webSearch, fetchPage, extractPdfDate },
  maxSteps: 15,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
  prompt: `Trouve les experts judiciaires de ${court}...`,
});
```

**Pro**: Works today, no Mastra dependency for the agent loop
**Con**: Loses Mastra features (observability, processors, agent registry)

### Solution 2: Use `previousResponseId` in Mastra

Pass `previousResponseId` in providerOptions to let OpenAI manage state server-side. But Mastra's agent loop doesn't currently support chaining response IDs.

### Solution 3: Wait for Mastra fix

File issue on Mastra GitHub — their agent loop needs to preserve reasoning items or use `previousResponseId`.

---

## Impact

This means we can run Mini with `effort: medium` right now — just not through Mastra's Agent class. A simple `generateText` loop gives us the same agent behaviour with reasoning that works.

The worktree's native SDK approach was correct all along. The AI SDK's `generateText` with `maxSteps` is the cleanest path — it's between "raw OpenAI SDK" and "Mastra Agent" in terms of abstraction level, and it handles reasoning items correctly.
