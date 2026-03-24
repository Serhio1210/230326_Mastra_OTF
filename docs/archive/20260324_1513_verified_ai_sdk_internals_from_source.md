# Verified: AI SDK Internals from Source Code

**Date**: 2026-03-24 15:13 UTC

---

## What we verified

We read the actual `@ai-sdk/openai` source code in `node_modules/@ai-sdk/openai/dist/index.mjs` to confirm what the AI SDK sends to OpenAI's API.

### Structured output: confirmed `text.format`

**Source**: line 4834-4842

```javascript
text: {
  format: {
    type: "json_schema",
    strict: strictJsonSchema,
    name: "response",
    description: responseFormat.description,
    schema: responseFormat.schema
  }
}
```

When you use `Output.object({ schema })` with the Responses API model (`openai("gpt-5.4-mini")`), the AI SDK translates it to `text.format` with `type: "json_schema"` — **identical to the native SDK's `zodTextFormat`**.

### Reasoning effort: confirmed `reasoning.effort`

**Source**: line 4867-4869

```javascript
reasoning: {
  effort: openaiOptions.reasoningEffort  // e.g. "medium"
}
```

When you set `providerOptions: { openai: { reasoningEffort: "medium" } }`, the AI SDK sends `reasoning: { effort: "medium" }` — **identical to the native SDK**.

### Chat Completions path (for comparison)

**Source**: line 702-704

```javascript
response_format: {
  type: "json_schema",
  json_schema: { ... }
}
```

If you use `openai.chat("model")` instead of `openai("model")`, the SDK uses the Chat Completions API with `response_format` instead of `text.format`. Different parameter name, same underlying schema mechanism.

---

## Conclusion

| Feature | AI SDK (Responses API path) | Native SDK | Identical? |
|---|---|---|---|
| Structured output | `text: { format: { type: "json_schema", schema } }` | `text: { format: zodTextFormat(schema) }` | **Yes** |
| Reasoning effort | `reasoning: { effort: "medium" }` | `reasoning: { effort: "medium" }` | **Yes** |
| Model | `gpt-5.4-mini` via Responses API | `gpt-5.4-mini` via Responses API | **Yes** |
| Web search tool | `web_search` (GA) | `web_search_preview` (older) | **No — Mastra uses newer version** |

The AI SDK and native SDK send identical API requests for structured output and reasoning effort. The only real difference is the web search tool version (`web_search` GA vs `web_search_preview`).

**We no longer need to say "we don't know what Mastra does."** We verified it from the source. It does exactly what the native SDK does.
