# OpenAI Web Search: Deep Link Limitation

**Date**: 2026-03-25
**Context**: Besançon court search fails because the web_search tool returns the domain root instead of the experts subpage

---

## The problem

The page `cours-appel.justice.fr/besancon/experts-judiciaires` exists and has the correct data. But when the agent uses `web_search` to find it, the search returns `cours-appel.justice.fr` (the homepage root) — not the deep link. The agent fetches the homepage, finds nothing useful, and spirals into the legacy site.

This is not a bug in our code or instructions. It's a fundamental limitation of the OpenAI web search tool.

## What the web_search tool actually is

It's a **search engine query**, not a **web crawler**. It returns whatever pages rank highest for the model's autonomously-chosen query. If a specific subpage is not well-indexed or well-ranked, it won't be found. There is no way to control what the model searches for.

## All available parameters

| Parameter | What it does | Helps with deep links? |
|---|---|---|
| `search_context_size` | `low` / `medium` / `high` — controls amount of web context retrieved | **No** — community reports it has negligible observable effect |
| `user_location` | Localizes search results geographically | **Maybe** — could bias toward local French results |
| `filters.allowed_domains` | Restricts results to specific domains (up to 100) | **No** — domain-level only, can't filter by URL path |
| `external_web_access` | `true` (live fetch) / `false` (cached only) | **No** — controls freshness, not depth |

**That's the complete list.** There is no parameter for: query refinement, search operators, URL path filtering, search prompt injection, or controlling what the model searches for.

## What we already use

- `user_location`: `{ country: "FR", region: "Île-de-France", city: "Paris" }`
- `filters.allowed_domains`: restricted to justice.fr domains
- `search_context_size`: not set (default `medium`)

## Workarounds we could try

### 1. `search_context_size: "high"`
Worth testing despite community skepticism. It's the only knob that might retrieve more results, increasing the chance the deep link appears. **Cost: minimal, no downside.**

### 2. `site:` operator in the prompt
Undocumented but reported to work sometimes. Including `site:cours-appel.justice.fr` in the user message may bias the model to search specifically within that domain. Unreliable — the model may or may not honor it. **Cost: free to try.**

### 3. Set `user_location` to the target city per court
Instead of always setting Paris, set `city: "Besançon"` for the Besançon search. Could bias results toward local content. **Cost: requires per-court config.**

### 4. Multi-step search instructions
Our instructions already say "retry search for modern site if first search only returns legacy URLs." We could strengthen this: "If your first search returns a domain root (no /experts or /expert-judiciaires path), search again with more specific terms before fetching."

### 5. Deep Research mode (`o3-deep-research`)
Can tap into hundreds of sources over minutes — would almost certainly find the deep link. But it's expensive and slow, not suitable for our use case.

### 6. Bypass web search entirely for known patterns
Since all modern court expert pages follow `cours-appel.justice.fr/[city]/experts-judiciaires`, we could skip search and go straight to fetchPage. But this defeats the purpose of having a search-first agent and would break for courts that don't follow this pattern.

## Known community complaints

- **"Citation links frequently lead only to website homepages rather than specific article pages"** — multiple reports
- **"The model appears to use only initial search results with brief descriptions rather than visiting linked pages"**
- **"search_context_size seems no longer working"** — unanswered by OpenAI
- **"Fairly similar results regardless of the parameters I pass"** — confirmed by multiple developers

## What we should try next

1. Add `search_context_size: "high"` — zero-cost experiment
2. Test `site:cours-appel.justice.fr` in the agent prompt for Besançon specifically
3. Test per-court `user_location.city` — set to the actual court city instead of always Paris

## Empirical proof: Besançon search comparison

We ran three configurations for Besançon with `include: ['web_search_call.results']` to see exactly what the model searches for and what comes back.

### The model's search queries (from `action.queries`)

All three configs produce good queries — the model even tries path-level searches:

```
"site:cours-appel.justice.fr/besancon \"experts judiciaires\""
"site:cours-appel.justice.fr Besançon experts judiciaires"
"site:ca-besancon.justice.fr experts judiciaires Cour d'appel de Besançon"
```

The model asks for exactly the right thing. The problem is what comes back.

### What URLs the search returns

| Config | URLs found | Correct? |
|---|---|---|
| `medium` (default) | `cours-appel.justice.fr/besancon` (homepage) + `ca-besancon.justice.fr` | ✗ homepage, not subpage |
| `high` | `cours-appel.justice.fr/besancon` (homepage) | ✗ same homepage |
| `high` + `city: "Besançon"` | `ca-besancon.justice.fr/art_pix/LISTE EXPERTS 2013.pdf` | ✗ **worse** — found a 2013 PDF |

The target URL `cours-appel.justice.fr/besancon/experts-judiciaires` never appears in any configuration. It is not in OpenAI's search index.

### Comparison with Paris (control)

For Paris, the same approach works perfectly:

```
Queries: ["site:cours-appel.justice.fr Cour d'appel de Paris experts judiciaires"]
URL found: cours-appel.justice.fr/paris/experts-judiciaires ✓
```

Paris's experts subpage IS in the index. Besançon's is NOT. Same query pattern, same domain, different indexing.

### Token usage comparison

| Config | Input tokens |
|---|---|
| medium | 12,384 |
| high | 12,397 |
| high + local | 12,038 |

`search_context_size` made virtually no difference in tokens or results. The community reports of "negligible observable effect" are confirmed.

## The smoking gun

The model formulates perfect search queries. It literally asks `site:cours-appel.justice.fr/besancon "experts judiciaires"`. But OpenAI's search index simply does not have that page. No parameter change can surface a page that isn't indexed.

## Conclusion

There is **no hidden parameter or undocumented technique** that reliably forces the web search tool to discover deep/subpage URLs. This is a known limitation that OpenAI has not addressed. The problem is not our queries, not our parameters, not our instructions — it's the search index.

Our best mitigations are:
1. `allowed_domains` — prevents legacy/third-party spiraling when the deep link isn't found
2. The trace system — when Besançon fails, we see exactly why (homepage vs deep link) and can retry or flag it
3. Accept that some courts depend on search index quality and will be flaky until OpenAI indexes the subpage
