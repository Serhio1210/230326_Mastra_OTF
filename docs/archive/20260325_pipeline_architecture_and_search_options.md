# Pipeline Architecture & Search Workaround Options

**Date**: 2026-03-25

---

## The Pipeline: What Happens at Every Step

Our court search is a **2-phase pipeline**: an agent loop that discovers and reads data, followed by a structured extraction call that produces the final JSON.

### Phase 1: Agent Loop

The agent loop calls `client.responses.create()` repeatedly until the model stops requesting tools.

#### Initial API call

```
client.responses.create({
  model: "gpt-5.4-mini" (or "gpt-5.4"),
  input: [
    { role: "system", content: EXPERT_SEARCH_INSTRUCTIONS },   ← ~800 tokens of instructions
    { role: "user", content: "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris..." }
  ],
  tools: [
    { type: "web_search", user_location: { country: "FR", ... }, filters: { allowed_domains: [...] } },
    { type: "function", name: "fetchPage", parameters: { url: string } },
    { type: "function", name: "extractPdfDate", parameters: { url: string } }
  ],
  reasoning: { effort: "low" }  ← or omitted for "none"
})
```

**What comes back**: `response.output` — an array of items:
- `web_search_call` — the model searched the web (handled internally by OpenAI, we just see the ID)
- `function_call` — the model wants us to run fetchPage or extractPdfDate (has `.name`, `.arguments`, `.call_id`)
- `message` — the model's text response (means it's done)

#### When the model requests tools

We execute each function call locally and send the results back:

**fetchPage(url)** — our code fetches the HTML with cheerio:
- Full result (kept for Phase 2): `{ title, pageText (10K chars), pdfLinks[], dateHints[] }`
- Compact result (sent back to the model): title + PDF link list + date hints only (drops the 10K raw pageText)

```
→ Model sees:
  Title: Experts judiciaires | Cour d'appel de Paris
  PDF links (11):
    - [likely-expert-list] "ANNUAIRE DES EXPERTS" → https://...pdf
    - [unknown] "voir lien ci-dessus" → https://...pdf
  Date hints from page: mise à jour : 10/03/2026
```

**extractPdfDate(url)** — our code downloads the PDF, extracts text from first 5 pages with unpdf:
- Full result (kept for Phase 2): `{ pdfText (full first 5 pages), pageCount }`
- Compact result (sent back to model): page count + first 500 chars only

```
→ Model sees:
  PDF (411 pages). First page text:
  COUR D'APPEL DE PARIS LISTE DES EXPERTS JUDICIAIRES ANNEE 2026 MAJ LE 10/03/2026...
```

**Why two versions?** The model only needs enough to decide what to do next (pick a PDF, determine if it found a date). But the extraction step in Phase 2 needs the full raw data to compare all date signals accurately.

#### The conversation grows each turn

Each turn, we append `response.output` (the model's tool calls) + our `function_call_output` items to the input array. So by Turn 3, the input contains:

```
[system instructions]
[user prompt]
[Turn 0: model's web_search_call + function_calls]
[Turn 0: our function_call_outputs (compact)]
[Turn 1: model's function_calls]
[Turn 1: our function_call_outputs (compact)]
[Turn 2: model's function_calls]
[Turn 2: our function_call_outputs (compact)]
```

**The model sees the full conversation history** — every prior tool call and result. This is how it knows what it already tried and what to do next.

#### Loop termination

The loop ends when:
- The model returns a `message` item with no `function_call` items → it's done, we capture `response.output_text` as `agentText`
- Or we hit `MAX_TURNS = 15` → we throw

**Output of Phase 1**: `agentText` (the model's summary) + `rawToolData` (full fetchPage and extractPdfDate results we saved)

### Phase 2: Structured Extraction

A separate, clean API call with no tools — just a prompt and a Zod schema.

```
client.responses.parse({
  model: "gpt-5.4-mini",
  input: [{ role: "user", content: extractionPrompt }],
  text: { format: zodTextFormat(expertFinderResultSchema, "expert_finder_result") },
  reasoning: { effort: "medium" }
})
```

**The extraction prompt contains ALL raw signals**, not just the agent's summary:

```
## Court: Paris

## Agent summary:                    ← agentText (first 2000 chars)
J'ai trouvé la page officielle...

## Page title:                       ← from rawToolData (fetchPage full result)
EXPERTS JUDICIAIRES | Cour d'appel de Paris

## Page text (first 2000 chars):     ← from rawToolData (fetchPage full result)
Rechercher ... mise à jour : 10/03/2026 ...

## PDF links found on the page:      ← from rawToolData (fetchPage full result)
- [likely-expert-list] "ANNUAIRE DES EXPERTS" → https://...pdf

## PDF content (first 1500 chars):   ← from rawToolData (extractPdfDate full result)
COUR D'APPEL DE PARIS LISTE DES EXPERTS JUDICIAIRES ANNEE 2026 MAJ LE 10/03/2026...
```

**Why a separate call?** The agent's conversation is long (multiple turns of tool calls and results). If we asked the agent to also produce structured output, it would be reasoning over 30K+ tokens of conversation noise. The clean extraction call sees only ~4K tokens of focused data and produces much better results.

**What comes back**: `response.output_parsed` — a fully typed object matching our Zod schema:

```typescript
{
  courtName: "Paris",
  pageUrl: "https://www.cours-appel.justice.fr/paris/experts-judiciaires",
  documentUrl: "https://...ANNUPARIS MAJ 10 MARS 26_2.pdf",
  documentTitle: "ANNUAIRE DES EXPERTS",
  publicationDate: "2026-03-10",
  publicationDateSource: "pdf-content",
  searchExplanation: "Found the official page on cours-appel.justice.fr...",
  dateExtractionExplanation: "The PDF contains 'MAJ LE 10/03/2026' on page 1...",
  errors: []
}
```

### Data flow diagram

```
Phase 1: Agent Loop
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  responses.create() ──→ web_search_call (OpenAI internal)       │
│         │               function_call: fetchPage(url)           │
│         │               function_call: extractPdfDate(url)      │
│         │                                                       │
│         ▼                                                       │
│  Execute tools locally                                          │
│         │                                                       │
│         ├──→ fetchPage: cheerio HTML parse                      │
│         │    Full result ──→ saved to rawToolData                │
│         │    Compact result ──→ sent back as function_call_output│
│         │                                                       │
│         ├──→ extractPdfDate: unpdf text extraction               │
│         │    Full result ──→ saved to rawToolData                │
│         │    Compact result ──→ sent back as function_call_output│
│         │                                                       │
│         ▼                                                       │
│  Append outputs to input array, loop back to responses.create() │
│         │                                                       │
│  ... repeat until model returns message (no more tool calls)    │
│         │                                                       │
│         ▼                                                       │
│  agentText = model's final summary                              │
│  rawToolData = { pageTitle, pageText, pdfLinks, pdfText, ... }  │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
Phase 2: Structured Extraction
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  responses.parse({                                              │
│    prompt: agentText + rawToolData (all signals combined),      │
│    schema: expertFinderResultSchema (Zod → JSON Schema),        │
│    reasoning: { effort: "medium" or "low" }                     │
│  })                                                             │
│         │                                                       │
│         ▼                                                       │
│  output_parsed: ExpertFinderResult (typed, validated)           │
│  { courtName, publicationDate, publicationDateSource, ... }     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Three Search Workarounds

All three target the same problem: the `web_search` tool returns `cours-appel.justice.fr` (homepage) instead of `cours-appel.justice.fr/besancon/experts-judiciaires` (the experts subpage).

### Option 1: `search_context_size: "high"`

**What it is**: A parameter on the `web_search` tool that supposedly controls how much web content the search retrieves.

```typescript
{
  type: "web_search",
  search_context_size: "high",  // ← add this
  user_location: { ... },
  filters: { allowed_domains: [...] }
}
```

**How it might help**: With `"high"`, the search may return more results. If the top result is the homepage, maybe the 3rd or 4th result is the deep link. More results = higher chance the subpage appears.

**The catch**: Multiple developers report this parameter has "negligible observable effect." OpenAI hasn't responded to bug reports about it. It might do nothing.

**Cost**: Zero — same API call, no extra tokens.

**TESTED**: We compared medium vs high for both Paris and Besançon. Result: identical URLs, identical token counts (12,384 vs 12,397), zero improvement. Community reports confirmed — this parameter has no observable effect. **Not worth adding.**

**What changes in our pipeline**: Only the `buildTools()` function. The model gets the same tool, just with a different search depth hint. Everything else stays the same.

### Option 2: `site:` operator in the prompt

**What it is**: Including search engine syntax like `site:cours-appel.justice.fr` in the user message, hoping the model passes it through to its internal search query.

```typescript
// Change the user message from:
"Trouve la liste officielle des experts judiciaires de la Cour d'appel de Besançon..."

// To:
"Trouve la liste officielle des experts judiciaires de la Cour d'appel de Besançon. Search site:cours-appel.justice.fr for the experts page..."
```

**How it might help**: If the model formulates its internal search query as `"experts judiciaires Besançon site:cours-appel.justice.fr"`, the search engine should return only pages from that domain — and the subpage would be a top result since the domain filter narrows the pool.

**The catch**: This is undocumented. The model decides autonomously what to search for. It might ignore the `site:` hint entirely, or it might pass it through. One community member reported it "doesn't return the exact source URL" even when it works. We already have `allowed_domains` doing domain filtering — the `site:` trick is redundant for domain restriction, but might influence the model's search query formulation differently.

**Cost**: Zero — just a prompt change. But it pollutes the instructions with search-engine-specific syntax that may confuse the model on other tasks.

**What changes in our pipeline**: Only the user message content in Phase 1's initial input. The `site:` text becomes part of what the model reads, and it may (or may not) incorporate it into its search query.

### Option 3: Per-court `user_location.city`

**What it is**: Instead of always setting `user_location` to Paris, set it to the actual court's city.

```typescript
// Currently:
user_location: { country: "FR", region: "Île-de-France", city: "Paris" }

// For Besançon:
user_location: { country: "FR", region: "Bourgogne-Franche-Comté", city: "Besançon" }
```

**How it might help**: Search engines personalize results by location. Someone in Besançon searching for "experts judiciaires" might see the Besançon court page ranked higher than someone in Paris. The local government/justice pages could be boosted in local results.

**The catch**: This requires knowing each court's city and region ahead of time — we'd need a lookup table or pass it in per call. It also assumes OpenAI's search engine actually uses `user_location` for result ranking (not just for location-aware queries like "restaurants near me"). French court pages may not benefit from local search bias since they're government sites, not local businesses.

**Cost**: Requires a per-court city/region mapping. Changes the `buildTools()` function to accept `user_location` as a parameter. More complex, but still no extra API calls.

**What changes in our pipeline**: The `web_search` tool config changes per court. We'd need to either pass `user_location` as part of `NativeOptions`, or build a court→city lookup. The search results may be different, which changes what URLs the agent sees in Turn 0, which changes everything downstream.

---

## Recommendation (updated after testing)

**Option 1 (`search_context_size: "high"`) — ruled out.** Tested empirically, zero effect on results or tokens. Not worth adding.

**Option 2 (`site:` in prompt) — ruled out.** The model already uses `site:` operators autonomously when `allowed_domains` is set (visible in `action.queries`). Adding it to the prompt is redundant.

**Option 3 (per-court `user_location`) — ruled out.** Tested for Besançon: setting `city: "Besançon"` produced **worse** results (found a 2013 PDF on legacy site instead of the homepage).

**None of the three options help.** The root cause is that OpenAI's search index does not have `cours-appel.justice.fr/besancon/experts-judiciaires` indexed. The model's search queries are perfect — the index is incomplete.
