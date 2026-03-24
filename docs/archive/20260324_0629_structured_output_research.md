# Structured Output Research & Decision

**Date**: 2026-03-24 06:29 UTC

---

## Why structured output uses 2 LLM calls

When you call `agent.generate(prompt, { structuredOutput: { schema } })` in Mastra, **two separate LLM calls happen**:

### Call 1 — The Agent (tools + reasoning)
- Model receives the prompt + system instructions
- Model calls web search tool (possibly multiple times)
- Model reasons over results
- Model returns a **free-text response** with its findings

### Call 2 — The Structuring Step
- A second LLM call receives the free-text response from Call 1
- It extracts data into the Zod schema shape
- Returns a validated `object` matching the schema

### Why not do it in one call?

The reason this exists as a 2-step process comes down to a fundamental conflict in how LLMs handle tools vs structured output:

1. **Tool calling requires flexible output** — the model needs to decide *when* to call tools, *what* to search for, and *how many times* to loop. This is open-ended reasoning that doesn't fit into a rigid schema.

2. **Structured output requires constrained output** — the model must produce JSON that exactly matches a Zod schema. This constrains the model's output tokens to valid schema shapes.

3. **You can't do both well simultaneously** — when a model is constrained to output a schema, it loses the ability to freely reason about tool results, decide to search again, or explain its intermediate thinking. Some models simply error when you try to combine both. Others technically support it but produce worse results because the schema constraint fights against the tool-calling loop.

4. **The AI SDK acknowledges this** — Vercel's docs explicitly state that structured output "counts as an additional step" in the execution flow and requires `stopWhen` tuning. Mastra's docs note that "some models may not support using both features together" and offer the 2-step approach as the reliable solution.

5. **The 2-step approach is actually cleaner** — the agent focuses purely on research and reasoning (what it's good at), and the structuring step focuses purely on extraction (what schemas are good at). Separation of concerns.

### The cost is acceptable

- **Call 1** (agent + web search) uses ~31k input tokens + $10/1000 searches — this is the expensive part
- **Call 2** (structuring) uses ~2-4k tokens to extract fields from the text — negligible in comparison
- Total test time: ~32 seconds, of which structuring is <2 seconds

### Options if cost becomes a concern

```typescript
// Option A — Current (same model for both calls)
agent.generate(prompt, { structuredOutput: { schema } })

// Option B — Cheaper model for structuring (1-line change)
agent.generate(prompt, {
  structuredOutput: { schema, model: "anthropic/claude-haiku-4-5" },
})

// Option C — AI SDK native (single flow, requires stopWhen tuning)
// Would need to bypass Mastra's agent abstraction and use generateText directly
const { output } = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  output: Output.object({ schema }),
  tools: { web_search: anthropic.tools.webSearch_20260209({ ... }) },
  stopWhen: stepCountIs(15),
  prompt: "...",
});
```

---

## Decision

**Keep Option A.** The 2-step approach is:
- Reliable (Paris test: 12/12 assertions pass)
- Clean (schema is defined once, used everywhere)
- Type-safe (consumers get `ExpertFinderResult` type)
- Switchable (Option B is a 1-line change if cost matters)
- Battle-tested (reference project uses the same pattern)

---

## Phase 1 Test Results

```
bun test src/test-search.test.ts

 1 pass, 0 fail, 12 expect() calls
 Ran 1 test across 1 file. [32.06s]
```

Validated fields:
- `courtName` contains "paris"
- `pageUrl` on `cours-appel.justice.fr/paris`
- `documentUrl` is a `.pdf` on `.justice.fr`
- `publicationDate` matches `YYYY-MM-DD` format
- `publicationDateSource` is not "not-found"
- `searchExplanation` and `dateExtractionExplanation` are non-empty
- `errors` is empty
