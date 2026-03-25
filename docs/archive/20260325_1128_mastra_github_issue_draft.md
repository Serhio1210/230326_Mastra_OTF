# Mastra GitHub Issue Draft: Agent Loop Missing Reasoning Item Fix

**Date**: 2026-03-25 11:28 UTC
**To file at**: https://github.com/mastra-ai/mastra/issues

---

## Issue title

`[BUG] agent.generate() with OpenAI reasoning models + web_search fails on multi-turn — fix from PR #13418 not applied to agent loop path`

## Description

### Problem

`agent.generate()` crashes on the second API turn when using OpenAI reasoning models (effort > "none") with `web_search` or other provider tools:

```
Item 'ws_...' of type 'web_search_call' was provided without its required
'reasoning' item: 'rs_...'
```

This happens because the agent loop's internal multi-turn message conversion does NOT strip OpenAI reasoning items, even though PR #13418 added this exact logic for the memory replay path.

### Reproduce

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  id: 'test',
  name: 'test',
  instructions: 'Search the web and answer.',
  model: openai('gpt-5.4-mini'),
  tools: {
    webSearch: openai.tools.webSearch(),
  },
});

// This CRASHES:
await agent.generate('Search for the weather in Paris', {
  maxSteps: 5,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
});

// This WORKS (AI SDK directly, same config):
import { generateText } from 'ai';
await generateText({
  model: openai('gpt-5.4-mini'),
  tools: { webSearch: openai.tools.webSearch() },
  maxSteps: 5,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
  prompt: 'Search for the weather in Paris',
});
```

### Root cause

PR #13418 added reasoning item stripping in `sanitizeV5UIMessages()` when `filterIncompleteToolCalls = true`. This is called correctly for memory replay at line 1889:

```javascript
// chunk-SLZ3WO42.js:1889 — memory path (FIXED)
const sanitized = sanitizeV5UIMessages(messages, filterIncompleteToolCalls);
```

But the agent loop's internal multi-turn path at line 2079 does NOT pass `true`:

```javascript
// chunk-SLZ3WO42.js:2079 — agent loop path (NOT FIXED)
const modelMessages = convertToModelMessages(sanitizeV5UIMessages(stepUiMessages));
//                                                                ^^^^^^^^^^^^^^
//                                              filterIncompleteToolCalls defaults to false
//                                              reasoning items NOT stripped
```

### Proposed fix

One-line change — pass `true` to enable the existing stripping logic:

```javascript
// chunk-SLZ3WO42.js:2079
const modelMessages = convertToModelMessages(sanitizeV5UIMessages(stepUiMessages, true));
```

The stripping logic already exists, is tested, and works correctly for the memory path. It just needs to be enabled for the agent loop path.

### Versions

- `@mastra/core`: 1.16.0
- `ai`: 6.0.137
- `@ai-sdk/openai`: 3.0.48
- Model: gpt-5.4-mini (also affects gpt-5.4, any model with reasoning)
- Tool: `openai.tools.webSearch()` (also affects any provider-executed tool)

### Related issues

- #11103 — OpenAI reasoning models fail with "reasoning item without required following item"
- #11481 — OpenAI reasoning model + memory: second generate fails
- #12980 — Gemini API call errors due to empty reasoning message
- PR #13418 — fix(core): strip OpenAI reasoning parts from LLM input (fixes memory path only)

### Workaround

Use `generateText` from the AI SDK directly instead of `agent.generate()`:

```typescript
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-5.4-mini'),
  tools: { webSearch: openai.tools.webSearch() },
  maxSteps: 10,
  providerOptions: { openai: { reasoningEffort: 'medium' } },
  prompt: '...',
});
```

The AI SDK's internal multi-step loop handles reasoning items correctly. The bug is only in Mastra's agent loop wrapper.

### Why this matters

Without this fix, Mastra users cannot use OpenAI reasoning models (effort > none) with web_search or other provider tools through `agent.generate()`. This rules out GPT-5.4's agentic capabilities (open_page, find_in_page) which require reasoning to be enabled.

---

## Why nobody reported this specific path

1. **Memory users are fixed** — PR #13418 fixed the memory replay path. Most chat-based agents use memory.
2. **Single-turn agents don't trigger it** — no second API turn means no conversation history issue.
3. **Default effort is "none"** — no reasoning items generated, no bug.
4. **The combination is specific** — reasoning + provider tools + multi-turn + no memory.
5. **Workaround exists** — users who hit it likely switched to `generateText` directly.

## Impact on our project

We cannot use GPT-5.4 Mini with `effort: medium` through Mastra agents. This means:
- Agent gives up after 2 turns at `effort: none` (too lazy for difficult courts)
- We get 6/10 accuracy instead of 9/10 (proven in worktree with native SDK)
- We're forced to either bypass Mastra's agent loop or use `effort: none` and accept lower accuracy
