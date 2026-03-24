# Clean Extraction Architecture — Sonnet 4.6 Native Structured Output

**Date**: 2026-03-24 09:27 UTC

---

## The insight

Instead of asking a model to dig through messy conversation history, give it exactly what it needs in a clean prompt:

```
Here is the agent's findings: [summary]
Extract the structured data.
```

No conversation history noise, no tool call artifacts, no ambiguity.

## Architecture

```
Step 1: Agent (Sonnet 4.6 + tools)
        → web search → fetchPage → extractPdfDate
        → produces text summary of findings

Step 2: Extraction (Sonnet 4.6, no tools)
        → clean prompt with agent's summary
        → native structured output (Output.object + Zod schema)
        → produces validated JSON
```

## Sonnet 4.6 settings for the extraction call

From Anthropic's docs (March 2026):

| Setting | Value | Why |
|---|---|---|
| `thinking: { type: "adaptive" }` | Recommended for 4.6, replaces `budgetTokens` |
| `effort: "low"` | Trivial extraction task, no deep reasoning needed |
| `Output.object({ schema })` | AI SDK native structured output |
| `structuredOutputMode: 'auto'` | Default — uses native `outputFormat` for Sonnet 4.6 |

Note: `thinking: { type: "enabled" }` and `budget_tokens` are deprecated on 4.6. Use adaptive thinking + effort instead.

## Why this works and the 2-step didn't

| | 2-step (Mastra structuredOutput) | Clean extraction |
|---|---|---|
| Context for structuring | Full conversation history (40k+ tokens) | Clean prompt (~3k tokens) |
| Sonnet's behaviour | Over-thinks, garbles fields | Reads clean data, fills schema |
| Native structured output | Can't use (conflicts with tool history) | Works perfectly (no tools in this call) |

## Comparison of all approaches

| Approach | Time | Correct? | Model for extraction |
|---|---|---|---|
| 05 — Mastra structuredOutput + Haiku | 65s | Yes | Haiku 4.5 |
| 06 — Mastra + Haiku + instructions | 58s | Yes | Haiku 4.5 |
| 07 — Clean prompt + Sonnet 4.6 native | 82s | Yes | Sonnet 4.6 |

## Tradeoff

- **Haiku approach (06)**: Faster (58s), cheaper, proven reliable
- **Clean extraction (07)**: Slower (82s), uses Sonnet for both steps, but architecturally cleaner — single model, clean separation, native structured output

Both are valid. The clean extraction approach is better for reliability and maintainability. The Haiku approach is better for cost/speed.
