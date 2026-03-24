# API Differences: Mastra vs Native OpenAI SDK

**Date**: 2026-03-24 15:10 UTC

---

## Web search: same Responses API, different tool versions

| | Mastra (`@ai-sdk/openai`) | Native (`openai` SDK) |
|---|---|---|
| **Underlying API** | OpenAI Responses API | OpenAI Responses API |
| **Tool sent** | `web_search` (GA) | `web_search_preview` (older) |
| **Status** | Generally available — production-ready | Preview — earlier version |

Both use the Responses API. But Mastra/AI SDK sends the newer `web_search` tool (GA), while the native worktree implementation uses the older `web_search_preview`.

This matters because:
- `web_search` is the production-ready version — GA as of 2026
- `web_search_preview` is described by OpenAI as "the earlier tool version"
- The native agent wastes Turn 0 trying to fetchPage on search engine URLs — this may be a `web_search_preview` behaviour that `web_search` (GA) handles internally

**How we know**: AI SDK 5+ defaults to Responses API (`openai("model")` = `openai.responses("model")`). The `openai.tools.webSearch()` helper produces the GA `web_search` tool definition.

---

## Structured output: we don't know what Mastra does internally

### Native (explicit)

```typescript
const result = await client.responses.parse({
  model: "gpt-5.4-mini",
  input: [{ role: "user", content: prompt }],
  text: { format: zodTextFormat(expertFinderResultSchema, "expert_finder_result") },
  reasoning: { effort: "medium" },
});
```

We see exactly:
- `responses.parse()` — Responses API with automatic Zod parsing
- `zodTextFormat()` — schema sent as `text.format` with `json_schema` type
- `reasoning: { effort: "medium" }` — explicit reasoning configuration

### Mastra (abstracted)

```typescript
const result = await generateText({
  model: openai("gpt-5.4-mini"),
  output: Output.object({ schema: expertFinderResultSchema }),
  providerOptions: {
    openai: { reasoningEffort: "medium" },
  },
  prompt: extractionPrompt,
});
```

We DON'T know:
- Does `Output.object` use `text.format` (Responses API) or `response_format` (Chat Completions)?
- Since AI SDK 5+ defaults to Responses API, it likely uses `text.format` — but we haven't verified
- How does the AI SDK translate `reasoningEffort: "medium"` to the API? Likely `reasoning: { effort: "medium" }` but abstracted

### What the AI SDK probably does

Given that AI SDK 5+ defaults to Responses API:
- `openai("gpt-5.4-mini")` → creates a Responses API model instance
- `Output.object({ schema })` → likely translates to `text: { format: { type: "json_schema", schema: ... } }`
- `reasoningEffort: "medium"` → likely translates to `reasoning: { effort: "medium" }`

But "likely" ≠ "verified." The AI SDK abstracts these details away. We trust the abstraction but can't confirm what's sent.

---

## Why this matters

| Concern | Impact |
|---|---|
| **Debugging** | When something breaks, we can't see the actual API request Mastra sends |
| **Feature parity** | If OpenAI adds a new Responses API feature, we wait for the AI SDK to expose it |
| **Tool version** | Mastra uses the newer `web_search` (good), but we didn't choose this — the AI SDK chose it |
| **Behaviour differences** | The Turn 0 waste in native (fetching search URLs) doesn't happen in Mastra — we don't know why because the web search integration is opaque |

---

## Debuggability comparison

| What you can see | Mastra | Native |
|---|---|---|
| Tool name in step history | `undefined` for provider tools | Always present |
| Tool call arguments | Hidden in `payload` object | Visible as `arguments` JSON |
| Web search events | Invisible (handled internally by AI SDK) | Visible as `web_search_call` output items |
| Full vs compact tool output | Both in `payload.result` (undocumented) | Explicit `fullResult` + `compactOutput` |
| API request body | Hidden by AI SDK | You build it yourself — full visibility |
| Structured output mechanism | Abstracted by `Output.object` | Explicit `zodTextFormat` + `responses.parse()` |
| Per-turn token usage | Via `onStepFinish` callback | Direct from `response.usage` |

**Native wins on debuggability.** You see every API request, every response, every decision. With Mastra, you see the results but not the mechanism.

**Mastra wins on productivity.** Agent definition, tool registration, observability, structured output — all declarative. The native version requires manual agent loop, tool dispatch, message management, and trace construction.
