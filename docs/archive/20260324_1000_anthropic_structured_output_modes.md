# Anthropic Structured Output: Three Modes Explained

**Date**: 2026-03-24 10:00 UTC

---

## Two separate Anthropic features

### 1. Native JSON output (`output_config.format`)

Constrains Claude's **text response** to match a JSON schema. The model physically cannot produce invalid JSON — the grammar constrains token generation.

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "date": {"type": "string"}
                },
                "required": ["name", "date"],
                "additionalProperties": False
            }
        }
    },
    messages=[...]
)
# response.content[0].text → guaranteed valid JSON string
```

- Response is a JSON **string** inside a text content block
- Schema violations are **impossible**
- No retry or validation logic needed
- ZDR compatible (schema cached 24h for optimization, no data retained)
- Available on: Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5

Note: `output_format` parameter is deprecated — use `output_config.format` instead (old param still works during transition).

### 2. Strict tool use (`strict: true`)

Constrains **tool call parameters** — not the response. When Claude calls a tool, the `input` field is guaranteed to match the tool's schema.

```python
tools=[{
    "name": "get_weather",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"location": {"type": "string"}},
        "required": ["location"],
        "additionalProperties": False
    }
}]
```

- Controls what goes **into** tools, not what the model **responds** with
- Tool names are guaranteed from provided tools list
- No validation needed on tool inputs

### Using both together

Anthropic supports both in the same request:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    output_config={"format": {"type": "json_schema", "schema": {...}}},
    tools=[{"name": "search", "strict": True, "input_schema": {...}}]
)
```

Claude calls tools first with validated parameters, then returns a final JSON response matching the output schema.

---

## How the AI SDK wraps this (`structuredOutputMode`)

The `@ai-sdk/anthropic` provider has three modes:

| Mode | What it sends to Anthropic API | When to use |
|---|---|---|
| `'outputFormat'` | `output_config.format` with JSON schema | Native structured output — guaranteed valid JSON |
| `'jsonTool'` | Creates a hidden tool with your schema | Legacy hack — model "calls" a fake tool to produce JSON |
| `'auto'` (default) | Picks best based on model | `outputFormat` for Sonnet 4.5+ / Haiku 4.5+, `jsonTool` for older |

### The jsonTool hack explained

Before `output_config.format` existed, the only way to get structured output from Claude was to define a fake tool (e.g. `json_output`) with your schema as its `input_schema`. Claude would "call" that tool — giving you structured data as tool parameters. This is what `jsonTool` mode does.

It works but it's a workaround. Native `outputFormat` is the correct approach for Sonnet 4.5+ / 4.6.

---

## JSON Schema limitations

Both features use a subset of JSON Schema:

**Supported**: `string`, `number`, `integer`, `boolean`, `array`, `object`, `properties`, `required`, `enum`, `type`, `additionalProperties: false`, `items`, `format` (limited), simple `$ref`

**Not supported**: `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `regex`, `allOf`, `oneOf`, `anyOf`

Unsupported constraints are automatically transformed by the SDKs — removed from the schema and added to field descriptions instead.

---

## What this means for our project

### Test 07 (clean extraction) uses native structured output

```typescript
const { output } = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  output: Output.object({ schema: expertFinderResultSchema }),
  prompt: cleanPrompt,
});
```

With `auto` mode (default), the AI SDK sends `output_config.format` → native structured output. The model is grammar-constrained. It **cannot** produce invalid JSON or wrong field types.

### Why earlier tests garbled: context rot, not a structured output problem

The native structured output guarantees the JSON **shape** is correct. It does NOT guarantee the **values** are correct. When Sonnet received a 40k-token conversation history for structuring, it picked wrong values from the noise (context rot). The JSON was valid — the data inside was wrong.

The clean prompt approach (test 07) fixes this by giving the model only the relevant data (~3k tokens) instead of the full conversation history.

### Can we use tools + native structured output in one call?

Technically yes — Anthropic supports it. But in practice, the long tool history degrades extraction quality (context rot). Two clean calls is more reliable than one messy call.

---

## SDK helpers

### TypeScript (our stack)
```typescript
// Via AI SDK
import { generateText, Output } from 'ai';
const { output } = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  output: Output.object({ schema: zodSchema }),
  prompt: "...",
});

// Via raw Anthropic SDK (if needed)
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
const response = await client.messages.parse({
  model: "claude-sonnet-4-6",
  output_config: { format: zodOutputFormat(zodSchema) },
  messages: [...]
});
console.log(response.parsed_output);
```

### Python
```python
from pydantic import BaseModel
class Result(BaseModel):
    name: str
    date: str

response = client.messages.parse(
    model="claude-sonnet-4-6",
    output_format=Result,
    messages=[...]
)
contact = response.parsed_output
```
