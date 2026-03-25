# When to Use Mastra vs Native OpenAI SDK

**Date**: 2026-03-25 11:34 UTC
**Based on**: 12+ hours building the same agent with both approaches

---

## Our recommendation

**Start with the native SDK. Add a framework when you outgrow it.**

We did the opposite — started with Mastra and spent hours fighting its abstractions before understanding what the underlying API actually does. If we'd started with the native SDK, we'd have had 9/10 accuracy in 2 hours instead of 12.

---

## Choose the Native OpenAI SDK when:

- You're using OpenAI models only
- You need reasoning models with tools (Mastra has a bug — PR #13418 only partially fixed)
- Debugging agent decisions matters (every turn, every tool call, every reasoning item visible)
- You want minimal dependencies (`openai` package vs 10+ packages)
- Your team can build a simple agent loop (~50 lines of code)
- You're prototyping or building a single-purpose agent
- You want full control over the API (previous_response_id, reasoning items, tool definitions)

## Choose Mastra when:

- You need multiple providers (switch between Anthropic/OpenAI/Gemini with one line)
- You have multiple agents that need to collaborate (supervisor agents, networks)
- You need conversation memory with persistent threads
- You want Mastra Studio UI for non-technical team members to test agents visually
- You're building a product with HTTP endpoints for agents (Hono adapter)
- You need workflows with complex branching and typed step chains
- You have a team where agent definition, workflows, and frontend are separate concerns
- You're building something that will grow in complexity over time

---

## What we learned from building both

### The numbers

| Metric | Mastra | Native SDK |
|---|---|---|
| Problems discovered | 27 (10 Mastra-specific) | 3 |
| Time to first working result | ~3 hours | ~30 minutes (worktree) |
| Cost per court (same model) | $0.024 | $0.024 |
| Speed per court (same model) | ~15s | ~15s |
| Best accuracy achieved | 6/10 (effort:none, lazy agent) | 9/10 (effort:medium) |
| Reasoning + web search | **Broken** (agent loop strips reasoning items) | Works |
| Debugging visibility | Custom trace logger needed (200+ lines) | Built into return type |
| Dependencies | 10 packages | 3 packages |

### What Mastra added value on

- **Mastra Studio** — visual agent testing UI was impressive when we finally used it. Chat with agents, see tool calls, inspect traces visually. Worth it for demos and non-technical stakeholders.
- **`createTool` with `toModelOutput`** — clean separation between what the app sees and what the model sees. This pattern is useful regardless of framework.
- **`TokenLimiter` processor** — one-line context management. Nice convenience.
- **Shared instructions** — agent config as code with typed schemas. Clean developer experience.

### What Mastra cost us

- **Structured output garbling** — 3 hours debugging Mastra's `buildStructuringPrompt` dumping 40k tokens to the structuring agent
- **`payload.result` hack** — undocumented way to access tool results from step history
- **`toolName: undefined`** — provider tools invisible in step data
- **ConsoleExporter noise** — had to disable and build our own trace logger
- **Reasoning bug** — cannot use OpenAI reasoning models (effort > none) with web search through Mastra agents. Fixed for memory path but not agent loop path. Blocks our best config.
- **`jsonPromptInjection`** — produced `undefined` with Anthropic
- **`prepareStep`** — broke structured output when disabling tools

---

## The reference project: where Mastra earns its keep

The production app (`290126__Assertra`) uses:

```
SvelteKit frontend → Inngest workflow → Mastra agent → Supabase database
```

Why Mastra makes sense there:
1. **Two agents to compare** — OpenAI and Gemini, same interface, swap in config
2. **Inngest orchestration** — batch 36 courts with retry, timeout, rate limiting
3. **Database integration** — structured output goes straight to Supabase JSONB
4. **Frontend** — SvelteKit reads results, shows date comparisons, PDF links
5. **Team** — agent, workflow, and frontend are separate concerns for different developers

That's the sweet spot for a framework. Multiple providers, multiple agents, database, frontend, team collaboration. The framework overhead pays off at that scale.

---

## For our project: native SDK is the right choice

Single agent, single provider, no database, no frontend, no orchestration. Just: "given a court name, find the PDF and date." A function that takes a string and returns JSON.

The native SDK does this in 50 lines with full debugging, reasoning support, and 9/10 accuracy. Mastra adds 10 dependencies and 27 documented problems for the same result.

The lesson isn't "Mastra is bad" — it's "frameworks have a complexity cost, and you should only pay it when you need what they offer."
