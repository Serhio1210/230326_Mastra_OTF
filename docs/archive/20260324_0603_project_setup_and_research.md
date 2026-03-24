# 230326_Mastra_OTF — Project Setup & Research Log

**Date**: 2026-03-24 06:03 UTC
**Stack**: Bun + Hono + Mastra + Anthropic

---

## 1. Project Initialisation

Created a new repo with:
- **Bun** as runtime and package manager
- **Hono** as web framework via `@mastra/hono` server adapter
- **Mastra** (`@mastra/core`) as AI agent framework

```
src/
├── index.ts                          # Hono server (Bun native export default, port 3000)
├── test-search.ts                    # Mastra Agent test (webSearch_20250305)
├── test-search-v2.ts                 # Raw SDK test (web_search_20260209)
└── mastra/
    ├── index.ts                      # Mastra instance with agent registered
    └── agents/
        └── expert-search.ts          # Anthropic agent with web search (France)
```

Server exposes Mastra endpoints at `/api/agents/{id}/generate` via the Hono adapter.

---

## 2. Agent: Expert Judiciaire Search

**Goal**: Search for the official list of experts judiciaires at the Cour d'appel de Paris.

### Mastra Agent (src/mastra/agents/expert-search.ts)
- **Model**: `claude-sonnet-4-6` via `@ai-sdk/anthropic`
- **Web search**: `anthropic.tools.webSearch_20250305()` (AI SDK wrapper)
- **User location**: France / Paris / Europe/Paris
- **maxUses**: 10 searches per conversation

### Raw SDK Script (src/test-search-v2.ts)
- **Model**: `claude-sonnet-4-6` via `@anthropic-ai/sdk`
- **Web search**: `web_search_20260209` (latest, with dynamic filtering)
- **User location**: France / Paris / Europe/Paris

Both scripts successfully found:
- **Official URL**: https://www.cours-appel.justice.fr/paris/experts-judiciaires
- **PDF annuaires** (2020–2025) freely downloadable
- **CNCEJ national directory**: https://www.cncej.org/annuaire
- Correctly flagged unofficial sites (exjudis.fr) to avoid

---

## 3. Research: web_search_20250305 vs web_search_20260209

| | `web_search_20250305` | `web_search_20260209` |
|---|---|---|
| Dynamic filtering | No | Yes — Claude executes code to prune results before context |
| Token usage | Higher (~40k+ input) | ~24% fewer input tokens |
| Search count | 4–5 per query | 2 per query |
| Accuracy | Good | ~11% better (Anthropic benchmark) |
| ZDR eligible | Yes | No (uses code execution internally) |
| AI SDK (`@ai-sdk/anthropic`) | `webSearch_20250305()` | **Not exposed yet** |
| Raw SDK (`@anthropic-ai/sdk`) | Supported | **Supported** |
| Mastra Agent | Works | **Blocked** (depends on AI SDK) |

**Key finding**: The Vercel AI SDK (`@ai-sdk/anthropic`) has not yet added `web_search_20260209`. Since Mastra uses the AI SDK under the hood, the newer tool is only accessible via the raw `@anthropic-ai/sdk`.

---

## 4. Research: Mastra + AI SDK vs Raw Anthropic SDK

### What you lose going raw SDK:

**From AI SDK**:
- Automatic tool loop (manual re-send with raw SDK)
- `generateObject()` with Zod schema validation
- Middleware (caching, guardrails, RAG)
- Lifecycle hooks (`onStepStart`, `onToolCallFinish`, etc.)
- OpenTelemetry tracing (one-line enable)
- Provider switching (swap Anthropic/OpenAI/Google with zero code changes)

**From Mastra (on top of AI SDK)**:
- Multi-agent networks with built-in routing
- Conversation memory with persistent storage
- Typed workflow step chains (agent → tool → agent)
- Evals (`@mastra/evals`) — automated quality checks
- Observability with trace exporters
- Auto-exposed HTTP endpoints (`/api/agents/{id}/generate`)
- Studio UI for visual testing/debugging

### What you gain with raw SDK:
- `web_search_20260209` with dynamic filtering
- Full API control (`pause_turn`, `encrypted_content`, citations, `cache_control`)
- Zero abstraction overhead

**Conclusion**: Use both. Mastra agent for the application layer; raw SDK for `web_search_20260209` until AI SDK catches up.

---

## 5. Research: Docker in Virtual Buddy VM (M4 Pro)

| VM Type | Nested Virt | Docker inside VM |
|---|---|---|
| Linux guest (`VZGenericPlatformConfiguration`) | Supported on M3+/macOS 15+ | Works |
| macOS guest (`VZMacPlatformConfiguration`) | Not supported | Does not work |

**Recommendation for M4 Pro**:
- Local dev: Run Docker/OrbStack directly on host
- If VM needed: Use a Linux VM (not macOS VM) in VirtualBuddy
- Future: Apple Containers (macOS 26 Tahoe) — native, no Docker needed

### OrbStack vs Apple Containers vs Docker Desktop

| | OrbStack | Apple Containers | Docker Desktop |
|---|---|---|---|
| Available now | Yes | macOS 26 beta only | Yes |
| Docker Compose | Yes | No | Yes |
| Cost (personal) | Free | Free (built into OS) | Free |
| Cost (commercial) | $8/mo/dev | Free | $9–24/mo/dev |
| Recommendation | **Use now** | Wait for GA | Alternative |

---

## 6. SDK Comparison for Web Search Agents (as of March 2026)

| | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| Biggest 2026 upgrade | `web_search_20260209` (dynamic filtering) | GPT-5.4 agentic search | Built-in + custom tools in one call |
| Best for | Deep reasoning over results | Lowest-friction Mastra integration | Find doc → inspect URL workflow |
| Mastra native support | Via AI SDK (older tool only) | Full native | Full native |
| Token efficiency | Best (with dynamic filtering) | Good | Good |

---

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.80.0",
  "@ai-sdk/anthropic": "^3.0.64",
  "@mastra/core": "^1.15.0",
  "@mastra/hono": "^1.2.6",
  "ai": "^6.0.137",
  "hono": "^4.12.9"
}
```

Runtime: **Bun 1.3.11** on macOS (Apple Silicon M4 Pro)
