# Force Web Search First: Solution Found

**Date**: 2026-03-25 10:52 UTC

---

## Problem

The agent skips web search and goes straight to `fetchPage` with a guessed URL from training data. Works for Paris but fails for non-standard court URLs.

## Solution: `toolChoice` + `prepareStep`

The `toolChoice: { type: 'tool', toolName: 'web_search' }` parameter forces the model to call web search. This was broken in older AI SDK versions but **fixed in PR #5442** (March 2025) — our SDK version (`@ai-sdk/openai@3.0.48`) includes the fix.

Combined with Mastra's `prepareStep`, we force web search on step 0 and let the agent use all tools after:

```typescript
await agent.generate(prompt, {
  maxSteps: 10,
  prepareStep: async ({ stepNumber }) => {
    if (stepNumber === 0) {
      return { toolChoice: { type: 'tool', toolName: 'web_search' } };
    }
    return {};
  },
});
```

## Verified working

1. **Direct `generateText`** — `toolChoice: { type: 'tool', toolName: 'web_search' }` → forced search, returned sources
2. **Mastra `agent.generate` + `prepareStep`** — step 0 forced to web search, then agent used fetchPage + extractPdfDate in step 1. Only 2 steps total.

## Why this is important

- **Prevents URL guessing** — model must search first, uses verified URLs
- **Works with `allowed_domains`** — search results restricted to justice.fr
- **No instruction hacks** — the tooling enforces the behaviour, not prompt engineering
- **Efficient** — only adds 1 forced search, rest is agent-directed

## Previous incorrect assumption

We assumed `toolChoice` with `web_search` was broken based on old GitHub issues. But the fix was merged March 2025 and is included in our SDK version. We should have retested earlier.
