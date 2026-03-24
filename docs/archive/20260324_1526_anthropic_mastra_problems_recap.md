# Anthropic + Mastra: Problems Recap

**Date**: 2026-03-24 15:26 UTC

---

## Anthropic-specific problems

| # | Problem | Severity | Status |
|---|---|---|---|
| 1 | **Model ID wrong** — `claude-sonnet-4-5-20250514` doesn't exist, 404 | Low | Fixed (used `20250929`, then `4-6`) |
| 2 | **`web_search_20260209` assumed missing** — AI SDK docs outdated, only showed `20250305` | Medium | Fixed (found in CHANGELOG + node_modules) |
| 5 | **Structured output + tools conflict** — Sonnet garbled `courtName` with reasoning text: `"}Excellent ! La page officielle..."` | **High** | Fixed (separate extraction call) |
| 6 | **Context rot** — Sonnet received 40k+ tokens for structuring, picked wrong values from noise | **High** | Fixed (clean prompt approach) |
| 7 | **Structuring timeout** — Sonnet 4.6 timed out at 180s and 300s | **High** | Fixed (toModelOutput + clean prompt) |
| 10 | **`jsonPromptInjection: true`** — produced `undefined` with Anthropic models | Medium | Fixed (don't use it with Anthropic) |
| 14 | **Cayenne SDK bug** — `@ai-sdk/anthropic` can't parse `code_execution_tool_result_error` from `web_search_20260209` dynamic filtering | Medium | **Unresolved** — SDK bug in `@ai-sdk/anthropic` |
| 15 | **Rate limit** — hit 2M tokens/min with 5 concurrent courts | Low | Workaround (sequential retry) |

## Mastra-specific problems (not provider-dependent)

| # | Problem | Severity | Status |
|---|---|---|---|
| 8 | **`toModelOutput` too aggressive** — agent couldn't see PDF URLs after filtering | Medium | Fixed (show all PDFs, drop raw pageText) |
| 9 | **`prepareStep` broke structured output** — returned null for date | Medium | Fixed (abandoned `prepareStep`) |
| 11 | **Default structuring instructions too generic** — "convert unstructured text into JSON" | Low | Fixed (custom `instructions` parameter) |
| 12 | **No effort/thinking settings configured** — using defaults for everything | Low | Fixed (`effort: "low"`, `thinking: adaptive`) |
| — | **`toolName: undefined`** for provider tools in step history | Medium | Workaround (read from `payload.toolName`) |
| — | **Full tool data hidden** — `tr.result` is empty, data is in undocumented `tr.payload.result` | Medium | Workaround (discovered by inspecting step objects) |
| — | **ConsoleExporter too noisy** — dumps OpenTelemetry spans with full instructions and headers | Low | Fixed (built custom trace logger, disabled ConsoleExporter) |

---

## The big three: problems 5, 6, 7

These are all the same root issue and cost us ~3 hours to diagnose and fix.

### What happens when you use `structuredOutput` with Anthropic + tools in Mastra

**Path A — no separate model** (`structuredOutput: { schema }`):
- Mastra tries to use native `response_format` on the same call that has tools
- Sonnet must produce tool-call JSON AND schema-constrained JSON simultaneously
- They fight each other → garbled output: reasoning text in schema fields

**Path B — separate model** (`structuredOutput: { schema, model: "..." }`):
- Mastra creates a `StructuredOutputProcessor` with a second agent
- The second agent receives the FULL conversation via `buildStructuringPrompt()`:
  - All reasoning text
  - All tool calls with arguments
  - All tool results (JSON stringified)
  - All text responses
- This is 40k+ tokens of noisy markdown
- Sonnet over-reasons about it → picks wrong values (context rot) or times out

### What we found in the Mastra source code

From `@mastra/core/dist/chunk-P4GCK6VL.js`, line 849:

```javascript
buildStructuringPrompt(streamParts) {
  // Collects ALL stream parts:
  // - reasoning-delta → "# Assistant Reasoning"
  // - tool-call → "# Tool Calls" (with args + output)
  // - tool-result → "# Tool Results" (JSON.stringify)
  // - text-delta → "# Assistant Response"
  return sections.join("\n\n");
}
```

The structuring agent receives EVERYTHING. There's no filtering, no compression, no selection of relevant parts. Even with `toModelOutput` reducing what the agent sees during reasoning, the `buildStructuringPrompt` uses the raw stream parts which contain the full data.

### How we fixed it

**Clean prompt approach** — bypass Mastra's `structuredOutput` entirely:

```typescript
// Step 1: Agent runs normally (free text + tools)
const agentResult = await agent.generate(prompt, { maxSteps: 15 });

// Step 2: Collect raw data from payload.result
// Step 3: ONE clean LLM call with just the relevant data
const { output } = await generateText({
  model: openai("gpt-5.4-mini"),
  output: Output.object({ schema }),
  prompt: `Here's the data. Extract the date.`,
});
```

No conversation history. No tool call artifacts. No 40k token markdown dump. Just clean data in, structured JSON out.

---

## With OpenAI Mini, none of these happened

When we switched to GPT-5.4 Mini:
- We went straight to the clean prompt approach
- Never used Mastra's `structuredOutput` on the agent
- No garbling, no timeouts, no context rot
- The extraction call uses `Output.object` directly via the AI SDK
- `reasoningEffort: "medium"` works on the extraction step (no tools = no parallel tool bug)

The Anthropic problems were a combination of:
1. **Sonnet being too smart** — over-reasons on extraction tasks
2. **Mastra's structuredOutput implementation** — feeds too much context to the structuring agent
3. **AI SDK wrapper gaps** — `web_search_20260209` parsing bugs, undocumented `payload.result`

None of these are fundamental to Anthropic's API — they're specific to the Mastra + AI SDK abstraction layer on top of it.
