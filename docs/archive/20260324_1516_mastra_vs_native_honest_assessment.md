# Mastra vs Native OpenAI SDK: Honest Assessment

**Date**: 2026-03-24 15:16 UTC

---

## For this project, we probably shouldn't have used Mastra.

This is not a criticism of Mastra — it's a recognition that our use case (single-purpose agent, one provider, no conversations, no multi-agent) doesn't benefit from a framework.

---

## What Mastra gave us vs what we actually needed

| Feature | Did we use it? | Worth it? |
|---|---|---|
| Declarative agent config | Yes | Minimal value — same as `new Agent()` |
| `createTool` with `toModelOutput` | Yes | Useful — but doable in 10 lines natively |
| `TokenLimiter` processor | Yes | One line — native loop controls context directly |
| `structuredOutput` on generate | **Tried, abandoned** | Failed with Sonnet (garbled), built our own 2-step |
| Observability (DefaultExporter) | **Tried, too noisy** | Built our own trace logger anyway |
| Tool result access | **Needed undocumented hack** | `payload.result` — not in docs |
| Provider switching (Anthropic ↔ OpenAI) | Yes | Needed separate agent definitions anyway |
| Hono server adapter | Set up, never used | Never exposed the API |
| Memory/conversations | No | Not needed |
| Workflows | No | Agent with tools was the right pattern |
| Mastra Studio | No | Never ran `mastra dev` |
| Multi-agent networks | No | Single agent |

## What the native SDK gave the worktree (for free)

| Feature | How |
|---|---|
| Full trace of every API call | Built into return type — `AgentTrace` |
| Tool call arguments visible | Directly from `response.output` |
| Web search events visible | `web_search_call` items in output |
| Compact vs full tool output | Explicit separation — no hack |
| Structured output | `responses.parse()` + `zodTextFormat` — one line |
| Agent loop control | Manual loop — every turn visible |
| Server-side state | `previous_response_id` available |
| Reasoning effort | `reasoning: { effort }` — direct |

## Problems we hit because of abstraction layers

1. **`structuredOutput` garbled output** — Mastra's 2-step approach fed the full conversation history to the structuring model. We spent hours debugging before understanding the internal `StructuredOutputProcessor` and its `buildStructuringPrompt` method.

2. **`toModelOutput` hides raw data** — The model sees compact output (good), but we couldn't access the full data for the extraction step. Had to discover the undocumented `payload.result` path.

3. **`toolName: undefined`** — Provider tools (web search) show as `undefined` in step history. Required workaround in our trace logger.

4. **ConsoleExporter dumps everything** — OpenTelemetry spans with full instructions, headers, metadata. Built our own clean trace logger to replace it.

5. **`jsonPromptInjection` doesn't work with Anthropic** — Tried it, got `undefined`. Had to discover this by trial.

6. **`prepareStep` broke structured output** — Tried disabling tools on final step, got `null` for date. Had to discover this by trial.

7. **Don't know what the SDK does internally** — Had to read `node_modules/@ai-sdk/openai/dist/index.mjs` to confirm it uses `text.format` for structured output.

## Dependency count

| | Mastra stack | Native SDK |
|---|---|---|
| Framework | `@mastra/core` | — |
| Server | `@mastra/hono` | — |
| Observability | `@mastra/observability` | — |
| Storage | `@mastra/libsql` | — |
| AI SDK | `ai` | — |
| Provider | `@ai-sdk/openai` + `@ai-sdk/anthropic` | `openai` |
| Tools | `cheerio`, `unpdf` | `cheerio`, `unpdf` |
| Schema | `zod` | `zod` |
| Server | `hono` | — |
| **Total packages** | **10** | **3** |

## Where Mastra IS worth it

- **Multiple providers in production** — route between Anthropic/OpenAI/Gemini by cost/availability
- **Multi-agent systems** — supervisor routing to specialist agents
- **Conversation memory** — persistent threads across sessions
- **HTTP API exposure** — one config to serve agents as endpoints
- **Visual debugging** — Mastra Studio for non-developers
- **Workflows** — deterministic pipelines with agent steps
- **Team projects** — standardised agent patterns across developers

None of these apply to our single-purpose court search agent.

## Cost/speed comparison

| | Mastra | Native |
|---|---|---|
| 10 courts total cost | $0.095 | $0.100 |
| 10 courts total time | 169s | 164s |
| Per-court average | $0.010, 17s | $0.010, 16s |
| **Difference** | — | **Negligible** |

Framework overhead is zero. The cost is the LLM + web search, which is identical.

---

## Conclusion

For this project: **native SDK would have been simpler, more debuggable, and equally performant.** We'd have avoided the structuredOutput garbling, the payload.result hack, the ConsoleExporter noise, and the hours spent understanding Mastra internals.

For a larger project with multiple agents, providers, conversations, and team collaboration: **Mastra would earn its keep.** The framework value scales with project complexity.

We learned more about both approaches by using Mastra than we would have going native from the start. The comparison (via the worktree) proves they produce equivalent results — the choice is about developer experience, not performance.
