# Observability Comparison: Mastra vs Native OpenAI SDK

**Date**: 2026-03-25 02:08 UTC

---

## What we tried in Mastra

### ConsoleExporter
- Dumps full OpenTelemetry spans to console
- Includes: system instructions, HTTP headers, provider metadata, request bodies
- **Too noisy for debugging** — hundreds of lines per agent run, hard to find the relevant info
- Disabled after first test

### DefaultExporter
- Persists traces to local SQLite (`mastra.db`)
- Viewable via Mastra Studio (`mastra dev`)
- We set it up but **never ran Mastra Studio** — the traces sit in the DB unused
- Strategy: `"realtime"` for development

### Custom trace logger (what we actually used)
We built `src/lib/trace-court-search.ts` — a custom logger that:
- Captures each step via `onStepFinish` callback
- Extracts tool data from `(tr as any).payload` (undocumented)
- Formats output as readable console logs with emoji icons
- Saves JSON traces per court

### What Mastra gives us (theory vs practice)

| Feature | Available? | Did we use it? |
|---|---|---|
| ConsoleExporter | Yes | Tried, too noisy, disabled |
| DefaultExporter + Studio | Yes | Set up, never viewed |
| `onStepFinish` callback | Yes | Yes — our primary debugging tool |
| Tool call names in steps | Partial — `undefined` for provider tools | Workaround via `payload.toolName` |
| Tool call arguments | Hidden in `payload` | Workaround via `(tr as any).payload.args` |
| Full tool results | Hidden in `payload.result` | Discovered by inspecting object keys |
| Web search events | Invisible | Can't see when/what the model searched |
| Per-turn token usage | Via `onStepFinish` `usage` | Yes |
| Trace ID | `result.traceId` | Never used |

---

## What the native OpenAI SDK gives us

The worktree implementation (`src/lib/run-court-search-native.ts`) builds tracing into the agent loop itself:

### Every API response is visible

```typescript
const response = await client.responses.create({
  model, input, tools, reasoning: { effort }
});

// Every output item is typed and inspectable
for (const item of response.output) {
  if (item.type === "web_search_call") → we see the search happened
  if (item.type === "function_call") → we see tool name + arguments
  if (item.type === "message") → we see the model's text
}
```

### Full vs compact tool output — explicit separation

```typescript
// Execute the tool
const fullResult = await handler(args);

// Keep full data for extraction step
rawToolData.pageText = fullResult.pageText;

// Send compact version to the model
const compactOutput = compactFetchPageResult(fullResult);
currentInput.push({ type: "function_call_output", output: compactOutput });
```

No hack needed. Full data and compact data are separate by design.

### Structured trace output

```typescript
type AgentTrace = {
  court: string;
  model: string;
  effort: string;
  totalMs: number;
  steps: AgentStep[];      // every turn with events
  extraction: { ... };     // extraction step details
  result: ExpertFinderResult;
  totalUsage: StepUsage;
  rawToolData: RawToolData; // page text, PDF links, PDF text
  error: string | null;
};
```

Saved as JSON per court — readable, diffable, searchable.

---

## Side-by-side comparison

| What you need to debug | Mastra | Native SDK |
|---|---|---|
| **"Did the agent search?"** | Can't tell — web search is invisible | `web_search_call` in output items |
| **"What URL did it fetch?"** | `payload.args` (undocumented hack) | `item.arguments` (typed) |
| **"What did fetchPage return?"** | `payload.result` (undocumented) | `fullResult` (explicit) |
| **"What did the model see?"** | `toModelOutput` result (not logged) | `compactOutput` (logged in trace) |
| **"Why did it pick this date?"** | Agent's text response (truncated) | Agent's full text + extraction reasoning |
| **"How many tokens per turn?"** | `onStepFinish` callback | `response.usage` per turn |
| **"How long did each tool take?"** | Not tracked | `durationMs` per tool call |
| **"What was the search query?"** | Invisible | In the web_search_call output |
| **"Show me the full trace"** | Custom logger + JSON file | Built into `AgentTrace` return type |
| **Setup effort** | 50+ lines of custom trace code | 0 — it's the return type |

---

## The Besançon example

### Debugging with Mastra (what we saw)

```
Turn 0 (2.4s)
  📞 Call provider-tool(undefined)    ← what tool? what URL? can't tell
  📞 Call provider-tool(undefined)
  📦 ✓ fetchPage result
     Title: Google Search             ← wasted turn, but WHY?
     PDFs found: 0
```

We could see the result but not **what the agent was trying to do**. The tool name is `undefined`, the arguments are hidden, and we can't see the web search query.

### Debugging with native SDK (what the worktree saw)

```
Turn 0 (2.1s)
  📞 Call fetchPage({"url": "https://www.google.com/search?q=..."})  ← exact URL visible
  📦 ✗ fetchPage → 0 PDFs (Google Search page)

Turn 1 (1.8s)
  🔍 Web search (id: ws_abc123)                                     ← search event visible
  📞 Call fetchPage({"url": "https://www.cours-appel.justice.fr/..."})
  📦 ✓ fetchPage → 1 PDF found
```

Every decision is visible: what URL the agent tried, why it failed, what it searched for, and what it did next.

---

## Verdict

**Native SDK is significantly better for debugging.** Not because Mastra can't do it — but because:

1. Mastra's OpenTelemetry approach is designed for **production monitoring** (dashboards, alerts), not **development debugging** (why did this specific court fail?)
2. Provider tools (web search) are treated as opaque by the AI SDK — events are hidden
3. Tool call arguments and results require undocumented hacks to access
4. We had to build 200+ lines of custom trace code to get what the native SDK gives for free

For production with dashboards and Mastra Studio, the built-in observability would work. For development and debugging specific agent decisions, the native SDK is the clear winner.
