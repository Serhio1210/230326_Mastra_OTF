# Mastra Structured Output: What Actually Happens Internally

**Date**: 2026-03-24 10:39 UTC

---

## The two paths

When you call `agent.generate(prompt, { structuredOutput: { schema } })`, Mastra takes **one of two paths** depending on whether you provide a `model`:

### Path A: No model provided → native structured output

```typescript
agent.generate(prompt, {
  structuredOutput: { schema }   // no model
})
```

Mastra passes the schema to the model provider using the `response_format` API parameter (or `output_config.format` for Anthropic 4.6). This is **native structured output** — the model's tokens are grammar-constrained.

**This is a single LLM call.** But it conflicts with tool calling because the model can't produce both tool call JSON and schema-constrained JSON in the same response.

### Path B: Model provided → `StructuredOutputProcessor` (second agent)

```typescript
agent.generate(prompt, {
  structuredOutput: { schema, model: "anthropic/claude-haiku-4-5" }
})
```

Mastra creates a `StructuredOutputProcessor` which internally creates a **second agent**:

```javascript
// From @mastra/core source (chunk-P4GCK6VL.js:761)
this.structuringAgent = new Agent({
  id: "structured-output-structurer",
  name: "structured-output-structurer",
  instructions: options.instructions || this.generateInstructions(),
  model: options.model
});
```

This second agent receives the main agent's output and extracts the structured data.

---

## What exactly does the second agent receive?

This is the critical part. The `buildStructuringPrompt` method (line 849) collects the **entire stream** from the main agent and formats it as markdown:

```javascript
// From source (line 849-901)
buildStructuringPrompt(streamParts) {
  // Collects:
  // - "reasoning-delta" → # Assistant Reasoning
  // - "tool-call"       → # Tool Calls (with args + output)
  // - "tool-result"     → # Tool Results (JSON stringified)
  // - "text-delta"      → # Assistant Response

  return sections.join("\n\n");
}
```

The structuring prompt sent to the second agent looks like:

```
Extract and structure the key information from the following text
according to the specified schema. Keep the original meaning and details:

# Assistant Reasoning
[all reasoning text...]

# Tool Calls
## web_search
### Input: {"query":"Paris cour d'appel experts judiciaires"}
### Output: [search results...]
## fetchPage
### Input: {"url":"https://..."}
### Output: [full tool result as JSON...]
## extractPdfDate
### Input: {"url":"https://...pdf"}
### Output: [full PDF text as JSON...]

# Assistant Response
[the agent's final text response...]
```

**This is why context matters.** The structuring agent receives ALL tool calls, ALL tool results (even with `toModelOutput`, the stream parts include the full data), ALL reasoning, and the final text. For our agent that's potentially 40k+ tokens.

---

## How does the second agent produce structured output?

The second agent calls `.stream()` with its own `structuredOutput`:

```javascript
// From source (line 788)
const structuringAgentStream = await this.structuringAgent.stream(prompt, {
  structuredOutput: {
    schema: this.schema,
    jsonPromptInjection: this.jsonPromptInjection
  },
  providerOptions: this.providerOptions,
});
```

Since this second agent has **no `model` override** on its own `structuredOutput`, it takes **Path A** — native `response_format` / `output_config.format`. So the second call DOES use native structured output.

**This means:** when we use Haiku as the structuring model, Haiku receives the full prompt and is grammar-constrained to produce valid JSON matching our schema. The JSON shape is guaranteed. The issue was always about **which values** it picks from the massive context, not whether the JSON is valid.

---

## Default instructions (when you don't provide your own)

```javascript
// From source (line 906-918)
generateInstructions() {
  return `You are a data structuring specialist. Your job is to convert
unstructured text into a specific JSON format.

TASK: Convert the provided unstructured text into valid JSON that matches
the following schema:

REQUIREMENTS:
- Return ONLY valid JSON, no additional text or explanation
- Extract relevant information from the input text
- If information is missing, use reasonable defaults or null values
- Maintain data types as specified in the schema
- Be consistent and accurate in your conversions`;
}
```

These are generic instructions. Our custom `instructions` parameter replaces these with specific guidance about what to extract from court expert data.

---

## Summary: what was the same and what was different

| Aspect | Haiku (test 06) | Sonnet garbled (run 1) | Sonnet w/ instructions (run 2) | Clean extraction (test 07) |
|---|---|---|---|---|
| **Agent model** | Sonnet 4.6 | Sonnet 4.6 | Sonnet 4.6 | Sonnet 4.6 |
| **Structuring model** | Haiku 4.5 | Sonnet 4.6 (same) | Sonnet 4.6 (same) | Sonnet 4.6 |
| **Path** | B (second agent) | A (same model, native) | B (second agent, same model) | Direct AI SDK call |
| **What structuring model sees** | Full stream as markdown | Full conversation + response_format constraint | Full stream as markdown | Clean prompt (~3k tokens) |
| **Native output constraint** | Yes (via Path A on second call) | Yes (directly) | Yes (via Path A on second call) | Yes (Output.object) |
| **Custom instructions** | No | N/A | Yes | N/A (prompt IS the instruction) |
| **Result** | Correct | Garbled courtName | Correct but wrong PDF | Correct |

### Key revelation

**Sonnet garbled (run 1)** took Path A — no separate model means Mastra tried to use native structured output on the SAME Sonnet call that had tools. This is the tool+structured output conflict. The model was trying to produce tool calls AND conform to the JSON schema simultaneously.

**Haiku and Sonnet run 2** both took Path B — a second agent. Both used native structured output on the second call (no tools). The difference was Haiku is more mechanical at extraction, and run 2 had custom instructions.

**Test 07** bypasses Mastra entirely — direct AI SDK call to Sonnet with a clean prompt and `Output.object`. No conversation history, no tool artifacts. Just data in, JSON out.

---

## Implications for our architecture

1. **Path A (no model) with tools is unreliable** — tool calling and native structured output conflict
2. **Path B (separate model) works but feeds the full stream** — context rot risk on long conversations
3. **Clean prompt approach (test 07) is the most reliable** — controls exactly what the model sees
4. **Haiku on Path B is a good compromise** — fast, cheap, mechanical extraction, handles context rot better than Sonnet

Sources:
- [Mastra source code](node_modules/@mastra/core/dist/chunk-P4GCK6VL.js) lines 725-919
- [Mastra Structured Output Docs](https://mastra.ai/docs/agents/structured-output)
- [DeepWiki — Mastra Structured Output](https://deepwiki.com/mastra-ai/mastra/3.7-structured-output)
- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
