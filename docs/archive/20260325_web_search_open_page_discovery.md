# Discovery: web_search Has Built-in open_page and find_in_page

**Date**: 2026-03-25

---

## What we found

The OpenAI `web_search` tool is not just a search engine. With reasoning models, it has three internal actions:

1. **`search`** — performs a web search query (what we thought was the whole tool)
2. **`open_page`** — fetches a URL and reads its content
3. **`find_in_page`** — searches within a loaded page for a pattern

These are **not separate tools** — they're sub-actions inside `web_search_call` that the model chains together autonomously as part of its reasoning.

## When does it work?

| Model | Effort | search | open_page | find_in_page |
|---|---|---|---|---|
| gpt-5.4-mini | none | ✓ | ✗ | ✗ |
| gpt-5.4-mini | medium | ✓ | **✓** | **✓** |
| gpt-5.4 | low | ✓ | **✓** | **✓** |

`open_page` and `find_in_page` require a **reasoning model** (or reasoning effort > none). At `effort=none`, the model only does basic search.

## Proof: Besançon with gpt-5.4-mini effort=medium

This is the court that fails with our current pipeline because search doesn't return the deep link.

```
Action: search
  Queries: ["site:cours-appel.justice.fr Besançon experts judiciaires"]

Action: search
  Queries: ["site:cours-appel.justice.fr/besancon \"experts judiciaires\""]

Action: search
  Queries: ["site:ca-besancon.justice.fr \"experts judiciaires\""]

Action: find_in_page
  Pattern: "experts"

Action: open_page                                          ← THIS IS NEW
  URL: cours-appel.justice.fr/besancon/experts-judiciaires ← FOUND THE DEEP LINK

Action: open_page                                          ← AND THIS
  URL: .../Annuaire experts 2026.pdf                       ← READ THE PDF TOO
```

**Result**: Found `"mise à jour : 24/02/2026"` + PDF link + PDF content — all from a single `web_search` tool with no custom functions.

Token usage: 28,132 input tokens (vs ~5K for search-only). The extra tokens are the page/PDF content injected into the model's context by the `open_page` actions.

## What this means for our pipeline

### Current pipeline (2 phases, 3 custom tools)

```
Phase 1: Agent loop (3-5 turns)
  web_search  → finds page URL
  fetchPage   → our cheerio tool, extracts PDFs + dates
  extractPdfDate → our unpdf tool, reads PDF text
  Model produces summary text

Phase 2: Extraction
  Clean prompt with raw data → structured JSON output
```

### Potential simplified pipeline (1 phase, 0 custom tools)

```
Phase 1: Single web_search call (reasoning model)
  search     → finds page URL
  open_page  → reads page content (built-in, replaces fetchPage)
  open_page  → reads PDF content (built-in, replaces extractPdfDate)
  Model has all data in context

Phase 2: Extraction
  Same structured output call → JSON
```

**Zero custom tools.** The model does everything through `web_search` with reasoning.

## Trade-offs

### Advantages of the simplified pipeline
- No custom tool code to maintain (no cheerio, no unpdf)
- Fewer turns — the model chains search → open → read in a single `web_search_call`
- Solves the Besançon problem — `open_page` can follow links from the homepage to the subpage
- The model sees the full page/PDF content, not our compressed version

### Advantages of keeping custom tools
- **Deterministic control** — we decide what URL to fetch and how to parse it
- **Works at effort=none** — cheapest and fastest config doesn't support `open_page`
- **Custom parsing** — our cheerio tool classifies PDF links by relevance, our unpdf tool extracts specific pages
- **Token efficiency** — compact tool output (~500 chars) vs full page content injected by open_page (~28K tokens)
- **Debuggability** — we see exactly what each tool returned in our trace; `open_page` is a black box inside `web_search_call`

### Cost comparison (estimated per court)

| Pipeline | Model | Effort | Agent tokens | Extraction tokens | Total cost |
|---|---|---|---|---|---|
| Current (custom tools) | gpt-5.4-mini | none/medium | ~20K | ~2K | ~$0.01 |
| Simplified (open_page) | gpt-5.4-mini | medium | ~28K | ~2K | ~$0.02 |
| Current (custom tools) | gpt-5.4 | low | ~30K | ~2K | ~$0.05 |

The simplified pipeline costs ~2x more per court because `open_page` injects full page content into the context instead of our compact summaries.

## Open questions

1. Can we see what `open_page` actually returned? (via `include: ['web_search_call.results']` we see the action types but not the content)
2. Does `open_page` handle PDF content reliably, or does it just see raw bytes?
3. How many `open_page` calls does the model make per search? Is it controllable?
4. Would a hybrid approach work — `web_search` with reasoning for discovery, then our custom tools for precise extraction?

## Next steps to validate

1. Run Besançon end-to-end with web_search only (no fetchPage, no extractPdfDate) and see if it produces the correct structured output
2. Compare token usage and cost across 10 courts
3. Check if open_page handles PDF text extraction reliably
