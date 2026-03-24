# OpenAI vs Anthropic: Built-in Tools Comparison

**Date**: 2026-03-24 15:19 UTC

---

## Full tool comparison (March 2026)

| Tool | OpenAI (Responses API) | Anthropic (Messages API) |
|---|---|---|
| **Web search** | `web_search` (GA) | `web_search_20260209` (GA, dynamic filtering) |
| **Web fetch** | — | `web_fetch_20260209` (GA) — fetch full page/PDF content |
| **Code execution** | `code_interpreter` | `code_execution` (GA, **free with web tools**) |
| **File search** | `file_search` (vector store) | — |
| **Computer use** | `computer_use_preview` | `computer_20251124` (GA) |
| **Image generation** | `image_generation` | — |
| **Tool search** | `tool_search` | `tool_search` (GA) — dynamic tool discovery |
| **Memory** | — | `memory_tool` (GA) |
| **Shell** | `shell` | — |
| **Programmatic tool calling** | — | `programmatic` (GA) — force specific tool calls |
| **Text editor** | — | `text_editor_20250124` |
| **MCP** | `hosted_mcp` (server-side) | Via Agent SDK |
| **Compaction** | `previous_response_id` (server-side state) | `compaction` API (beta) — context summarization |
| **Fast mode** | — | `speed: "fast"` (beta, Opus only, 2.5x faster) |
| **Structured output** | `text.format` + `json_schema` | `output_config.format` + `json_schema` |
| **Reasoning control** | `reasoning: { effort }` (none→xhigh) | `effort` + `thinking: { type: "adaptive" }` |

---

## What we LOSE going OpenAI-only

### 1. Web fetch (biggest impact for our project)
Anthropic has a built-in `web_fetch` server tool that fetches full web pages and PDFs. We built 100+ lines of custom `fetchPage` code with cheerio that Anthropic provides for free as a server tool. No custom code, no cheerio dependency, no maintenance.

### 2. Dynamic filtering on web search
`web_search_20260209` uses code execution to prune search results before they hit the context window. Anthropic reports ~24% fewer input tokens and ~11% better accuracy on search benchmarks. OpenAI's `web_search` doesn't have this — all results go straight into context.

### 3. Free code execution with web tools
On Anthropic, code execution costs nothing when used alongside web search or web fetch. OpenAI charges for `code_interpreter` usage.

### 4. Memory tool
Built-in server-side memory for agents — persists information across conversations. OpenAI doesn't have an equivalent built-in tool.

### 5. Programmatic tool calling
Force Claude to call specific tools in a specific order. Useful for guaranteed tool execution. OpenAI doesn't have this.

### 6. Fast mode
2.5x faster inference on Opus at premium pricing ($30/$150 per MTok). No equivalent on OpenAI.

---

## What we GAIN going OpenAI-only

### 1. File search
Vector store search built into the API. Upload documents, the API indexes them, the model searches them. Anthropic doesn't have this.

### 2. Image generation
Built-in DALL-E image generation. Anthropic doesn't generate images.

### 3. Shell tool
Run commands in hosted containers. Useful for code agents. Anthropic doesn't have this.

### 4. Hosted MCP
Run MCP servers on OpenAI infrastructure. Anthropic's MCP support is via the Agent SDK, not built into the API.

### 5. Full Responses API
`previous_response_id` for server-side conversation state management. No need to manage message history client-side. Anthropic's `compaction` is similar but still in beta.

### 6. Agents SDK (TypeScript)
`@openai/agents` — native multi-agent framework with handoffs, guardrails, tracing. Production-ready. Anthropic's Agent SDK exists but Claude's multi-agent patterns aren't as developed.

---

## For our court search agent specifically

| What we need | OpenAI | Anthropic | Winner |
|---|---|---|---|
| Web search | `web_search` (GA) | `web_search_20260209` + dynamic filtering | **Anthropic** — 24% fewer tokens |
| Page fetching | Custom tool (100+ lines cheerio) | **Built-in `web_fetch`** — zero code | **Anthropic** — no custom tool needed |
| PDF reading | Custom tool (unpdf) | Custom tool (unpdf) | Tie |
| Structured output | `text.format` + `json_schema` | `output_config.format` + `json_schema` | Tie |
| Extraction model cost | GPT-5.4 Mini ($0.75/1M in) | Haiku 4.5 ($0.80/1M in) | Tie |
| Agent SDK maturity | `@openai/agents` (TypeScript) | Agent SDK (Python first) | **OpenAI** for TypeScript |
| Debuggability | Responses API — full visibility | Messages API — less visibility | **OpenAI** |
| Code execution cost | Paid | **Free with web tools** | **Anthropic** |

### The irony

We chose OpenAI for cost ($0.026/court with Mini vs $0.70 with Sonnet). But Anthropic has built-in `web_fetch` that would have eliminated our custom `fetchPage` tool entirely, and dynamic filtering that would have reduced token usage by 24%. If we used Anthropic's Haiku 4.5 ($0.80/1M input) with built-in tools, the cost would be comparable to Mini — and we'd need less custom code.

---

## Recommendation for production

| Approach | When to use |
|---|---|
| **OpenAI Mini (current)** | Cost-sensitive batch runs, $0.03/court, good enough accuracy |
| **Anthropic Sonnet + built-in web_fetch** | When accuracy matters, built-in tools reduce custom code, dynamic filtering saves tokens |
| **Hybrid: OpenAI for agent, Anthropic for difficult courts** | Best of both — Mini for bulk, Sonnet for retries on failures |
| **Native OpenAI SDK** | Maximum debuggability, same cost as Mastra, full trace control |

The "best" answer depends on what matters most: cost (OpenAI Mini), accuracy (Anthropic Sonnet), code simplicity (Anthropic built-in tools), or debuggability (native OpenAI SDK).
