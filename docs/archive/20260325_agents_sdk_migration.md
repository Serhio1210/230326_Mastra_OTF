# Migration: Raw OpenAI SDK → OpenAI Agents SDK

**Date**: 2026-03-25

---

## What happened

We built the entire pipeline using the raw OpenAI Node.js SDK (`openai` package) — `client.responses.create()` and `client.responses.parse()` with manual agent loops, manual tool wiring, and a custom trace system. We should have been using the **OpenAI Agents SDK** (`@openai/agents`) from the start.

## What the Agents SDK gives us for free

| Feature | What we built by hand | Agents SDK |
|---|---|---|
| Agent loop | 50+ lines: check for function_calls, execute, append function_call_output, loop | `run(agent, input)` — one line |
| Tool registration | Raw JSON Schema tool definitions + manual dispatch | `webSearchTool()`, `tool()` with Zod |
| Structured output | `zodTextFormat()` + `responses.parse()` + null check | `outputType: schema` on Agent constructor |
| Tracing to dashboard | Nothing (flat logs at /logs) | **Automatic** — `withTrace()` sends hierarchical spans to platform.openai.com/traces |
| Local debug tracing | ~100 lines custom `StepTrace` types + JSON serialization | `ConsoleSpanExporter` (built-in) |
| Multi-step correlation | Custom `PipelineTrace` with manual step recording | `withTrace('name', async () => { ... })` groups all `run()` calls |
| Tool call spans | Manual event recording in trace | Automatic `FunctionSpan` per tool call |
| Generation spans | Manual token counting | Automatic `GenerationSpan` with usage |

## Code impact

| Implementation | Lines | Manual tracing | Dashboard |
|---|---|---|---|
| `run-court-search-native.ts` (raw SDK, agent loop) | 554 | 100+ lines custom | None |
| `run-court-search-3step.ts` (raw SDK, 3-step chain) | 570 | 100+ lines custom | None |
| **`run-court-search-agents.ts` (Agents SDK)** | **348** | **0 lines** | **Automatic** |

**39% less code**, zero tracing boilerplate, automatic dashboard integration.

## What stayed the same

The 3-step architecture (DISCOVER → COLLECT → DECIDE) is identical. The Agents SDK is just a better way to execute Steps 1 and 3:

- **DISCOVER**: `Agent` with `webSearchTool()` + `outputType` → `run()` handles the loop
- **COLLECT**: Same deterministic code — cheerio page parsing, unpdf PDF extraction, regex date signals. No LLM, no SDK involvement.
- **DECIDE**: `Agent` with `outputType` → `run()` returns structured result

## Key code differences

### Before (raw SDK):

```typescript
// DISCOVER — 40 lines
const response = await client.responses.parse({
  model: "gpt-5.4-mini",
  input: [
    { role: "system", content: instructions },
    { role: "user", content: prompt },
  ],
  tools: [{
    type: "web_search",
    user_location: { type: "approximate", country: "FR", city: "Paris" },
    filters: { allowed_domains: [...] },
  }],
  text: { format: zodTextFormat(discoverResultSchema, "discover_result") },
  reasoning: { effort: "medium" },
  include: ["web_search_call.results"],
});
const parsed = response.output_parsed;
if (!parsed) throw new Error("structured output returned null");
// + 30 lines of trace recording
```

### After (Agents SDK):

```typescript
// DISCOVER — 5 lines
const discoverAgent = new Agent({
  name: "discover",
  model: "gpt-5.4-mini",
  instructions: "...",
  tools: [webSearchTool({ userLocation: { country: "FR" }, filters: { allowedDomains: [...] } })],
  outputType: discoverResultSchema,
  modelSettings: { reasoning: { effort: "medium" } },
});

const result = await run(discoverAgent, prompt);
// result.finalOutput is typed, validated, no null check needed
// trace is automatic — shows up at platform.openai.com/traces
```

### Pipeline orchestration:

```typescript
// Before: 50 lines with try/catch, manual step recording, JSON saving
// After:
const result = await withTrace(`court-search-${court}`, async () => {
  const discover = await run(discoverAgent, prompt);
  if (!discover.finalOutput.found) return { success: false, ... };
  const collect = await stepCollect(discover.finalOutput);
  const decide = await run(decideAgent, buildDecidePrompt(collect));
  return { success: true, result: decide.finalOutput, collect };
});
```

## Test results

| Court | Raw 3-step | Agents SDK | Date match |
|---|---|---|---|
| Paris | 14.2s, $0.0073 | 13.3s | ✓ 2026-03-10 |
| Besançon | 25.6s, $0.0157 | 58.7s | ✓ 2026-02-24 |

Both correct. Besançon took longer with Agents SDK (more search attempts in DISCOVER) but still found the right answer via `open_page` navigation.

## Files

| File | Status | Purpose |
|---|---|---|
| `src/lib/run-court-search-agents.ts` | **Current** | Agents SDK 3-step pipeline |
| `src/tests/27-agents-sdk-test.ts` | **Current** | Test runner |
| `src/lib/run-court-search-3step.ts` | Historical | Raw SDK 3-step (kept for reference) |
| `src/lib/run-court-search-native.ts` | Historical | Raw SDK agent loop (kept for reference) |
| `src/tests/22-*.ts` through `src/tests/26-*.ts` | Historical | Old tests (kept for reference) |

## Observability

Traces are automatically sent to **platform.openai.com/traces** with:
- Trace name: `court-search-{court}`
- Agent spans for DISCOVER and DECIDE
- Generation spans with token usage
- Web search spans (search, open_page, find_in_page actions)

No code needed. No JSON files to manage. No custom trace types.
