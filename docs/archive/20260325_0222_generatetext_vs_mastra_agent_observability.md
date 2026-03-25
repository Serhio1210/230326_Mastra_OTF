# generateText vs Mastra Agent: Observability Trade-offs

**Date**: 2026-03-25 02:22 UTC

---

## Context

We discovered that `generateText` with `maxSteps` + `reasoningEffort: "medium"` works perfectly — the AI SDK preserves reasoning items correctly. But Mastra's `agent.generate` crashes because its agent loop strips reasoning items when building multi-turn messages.

The question: if we bypass Mastra Agent and use `generateText` directly, what do we lose in observability?

---

## What each approach gives us

| Feature | Mastra Agent | `generateText` direct |
|---|---|---|
| **Mastra Studio traces** | Yes (DefaultExporter → SQLite → Studio UI) | **No** — not registered as agent |
| **ConsoleExporter spans** | Yes (but too noisy — we disabled it) | **No** |
| **DefaultExporter to SQLite** | Yes (set up, never viewed in Studio) | **No** |
| **`onStepFinish` callback** | Yes | **Yes** — same API, same data |
| **`result.steps`** with tool data | Yes (via `payload.result` hack) | **Yes** — and likely cleaner format |
| **`result.usage`** token counts | Yes | **Yes** |
| **`result.sources`** from web search | Yes | **Yes** |
| **`providerMetadata.openai.responseId`** | Yes | **Yes** |
| **Agent registry (`mastra.getAgent`)** | Yes | **No** — standalone function |
| **Hono endpoint auto-exposure** | Yes (`/api/agents/{id}/generate`) | **No** — manual route needed |
| **Our custom trace logger** | Works (with `payload.result` hack) | **Works** — and no hack needed |

---

## The key insight

The observability features we **actually use** are:

1. **`onStepFinish`** — available on both
2. **`result.steps`** — available on both
3. **Our custom trace logger** — works on both (and is simpler with `generateText` because no `payload` wrapper)

The observability features we **set up but never used** are:

1. **Mastra Studio** — never ran `mastra dev`
2. **DefaultExporter** — traces sit in SQLite unread
3. **ConsoleExporter** — disabled because too noisy

---

## Step data format comparison

### Mastra Agent `result.steps`
```typescript
for (const tr of step.toolResults) {
  const p = (tr as any).payload;     // undocumented
  p.toolName;                         // "fetchPage" or undefined for provider tools
  p.result;                           // full execute result
}
```

### `generateText` `result.steps`
```typescript
for (const tr of step.toolResults) {
  tr.toolName;      // directly available
  tr.args;          // input arguments
  tr.result;        // full execute result (or toModelOutput?)
}
```

Need to verify: does `generateText` expose the full `execute` result or the `toModelOutput` result in `tr.result`? If it exposes the full result, we get **better** observability than Mastra.

---

## For production / server deployment

| Need | `generateText` approach | How to solve |
|---|---|---|
| HTTP endpoint | No auto-exposure | Add a Hono route manually (5 lines) |
| Mastra Studio | Not available | Use our custom trace logger + JSON files instead |
| Agent registry | Not available | Export as a named function |
| Observability dashboard | Not available | Use trace JSON files or build a simple UI |

---

## Conclusion

We lose Mastra server features we never used. We keep the debugging features we actually use. The `generateText` approach may give us **better** local debugging because:
- No `payload.result` hack — direct access to tool data
- `toolName` is populated (not `undefined` for provider tools)
- `onStepFinish` works identically
- Reasoning items are preserved (the actual fix we need)

The trade-off is clear: **lose unused server features, gain working reasoning + cleaner debugging.**
