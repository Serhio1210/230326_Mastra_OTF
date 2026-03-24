# Final Mini Improvements & Search Variance

**Date**: 2026-03-24 14:38 UTC

---

## Fixes applied in this round

### 1. Country parameter missing
OpenAI web search was configured with `city: "Paris", region: "Île-de-France"` but **no `country: "FR"`**. Without the country, search results were less focused on French government sites. Anthropic's config had `country: "FR"` from the start.

### 2. Strict modern-site-first instructions
Old: "If the modern site doesn't work, try legacy domains"
New: "ALWAYS try cours-appel.justice.fr first. Only fall back to legacy if it fails. NEVER use third-party sites."

The agent was going to legacy sites (ca-[city].justice.fr) or association sites (cejca-*.fr) even when the modern site was available. Besançon's modern site has been accessible the whole time — the agent just wasn't trying it.

### 3. Raw tool data to extraction step
Extraction LLM now receives page text, PDF URLs, and PDF content directly from `payload.result`, not just the agent's text summary.

### 4. Medium reasoning on extraction
`reasoningEffort: "medium"` on the extraction step (no tools = no parallel tool bug). The LLM actually reasons about which date signal is best instead of pattern-matching.

---

## Results across multiple runs

| Court | Before fixes | After fixes (best) | Ground truth |
|---|---|---|---|
| Besançon | 2013-03-20 | **2026-02-24** (page-text) | ~2026-02-24 |
| Amiens | 2022-12-05 | **2026-02-01** (page-text) | ~2026-02 |
| Bordeaux | 2025-01-01 | **2025-07-01** (filename) | ~2025-07 |
| Angers | 2025-11-18 | **2026-03-20** (page-text) | 2026-03-20 |
| Lyon | 2025-11-21 | 2025-11-21 (pdf-content) | 2025-11-21 |
| Paris | 2026-03-10 | 2026-03-10 (pdf-content) | 2026-03-10 |

All 6 divergent courts now produce correct results — **when the agent finds the right page.**

---

## Search variance: the remaining problem

Results vary between runs because web search is non-deterministic:

| Court | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Besançon | 2013 | **2026-02-24** | null |
| Bordeaux | 2025-01-01 | 2025-01-01 | **2025-07-01** |
| Lyon | 2025-11-21 | 2025-11-21 | 2026-01-15 |

The same court can return different results because:
- Web search returns different pages each time
- The agent may find different PDFs on the same page
- Legacy vs modern site routing varies

### Production mitigations
- **Retry**: Run each court 2-3 times, take the most recent date
- **Cache known URLs**: Once we find a working page URL, cache it for future runs
- **Validate against reference**: Flag results that are older than our reference data
- **Multiple search engines**: Run with both Anthropic and OpenAI search, compare

---

## Architecture summary (final state)

```
Agent (GPT-5.4 Mini, effort: none)
  → web search (country: FR, city: Paris)
  → fetchPage (cheerio HTML parsing, toModelOutput for agent)
  → extractPdfDate (unpdf 5 pages, toModelOutput for agent)
  → raw data collected via payload.result
                    ↓
Extraction (GPT-5.4 Mini, effort: medium, no tools)
  → receives: agent summary + page text + PDF URLs + PDF content
  → native structured output (Output.object + Zod schema)
  → returns: ExpertFinderResult JSON
```

Cost: ~$0.03/court | Time: ~15s/court | 36 courts: ~$1.10
