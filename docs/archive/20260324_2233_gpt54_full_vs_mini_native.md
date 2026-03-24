# GPT-5.4 Full (low effort) vs Mini — Native SDK

**Date**: 2026-03-24 22:33 UTC

---

## Setup

Both implementations use the native OpenAI SDK with:
- `allowed_domains` filter (justice.fr domains)
- Updated instructions (courdecassation.fr allowed)
- 2-step architecture: agent loop → structured extraction

| | Mini | Full |
|---|---|---|
| Model | gpt-5.4-mini | gpt-5.4 |
| Agent effort | none | low |
| Extraction effort | medium | medium |

## Results: 2/10 agree

| Court | Mini | Full | Winner |
|---|---|---|---|
| Paris | 2026-03-10 (pdf-content) | 2026-03-10 (pdf-content) | **Tie** ✓ |
| Lyon | 2026-02-13 (pdf-content) | null (not-found) | **Mini** — full didn't even try fetching |
| Angers | null (not-found) | 2026-03-20 (page-text) | **Full** — found page update date |
| Besançon | 2026-02-24 (page-text) | 2025-05-19 (page-text) | **Mini** — full got wrong date after 78s |
| Bordeaux | 2025-01-01 (pdf-content) | 2025-07-01 (filename) | **Full** — URL path date is better |
| Amiens | 2025-03-01 (filename) | 2026-02-01 (page-text) | **Full** — found 2026 page update |
| Aix-en-Provence | 2025-12-10 (pdf-content) | 2026-02-19 (page-text) | **Debatable** — PDF date vs page date |
| Rennes | 2026-03-04 (pdf-content) | 2026-03-04 (pdf-content) | **Tie** ✓ |
| Cayenne | null (not-found) | 2022-11-23 (filename) | **Full** — found courdecassation PDF |
| Grenoble | 2026-01-02 (page-text) | 2026-02-27 (page-text) | **Full** — more precise date |

## Cost and timing

| | Mini | Full | Ratio |
|---|---|---|---|
| Total cost | $0.067 | $0.556 | **8.3x** more expensive |
| Total time | 111s | 423s | **3.8x** slower |
| Avg per court | $0.007 / 11.1s | $0.056 / 42.3s | |

## Analysis

### Full model wins: Cayenne, Amiens, Bordeaux, Grenoble
GPT-5.4 full is more thorough — it does more web searches and is more likely to find content on hard courts. Cayenne (which Mini failed on entirely) succeeded with the full model by searching courdecassation.fr extensively.

### Full model loses: Lyon, Besançon
- **Lyon**: The full model returned `null` — it produced a final text response on Turn 0 without making any tool calls. The model decided to answer from memory rather than search.
- **Besançon**: 78 seconds, 15+ web searches, and the full model found a 2025 date from the legacy site instead of the 2026 date Mini found in 11 seconds from the modern site.

### Full model over-searches
The traces show the full model does far more web searches per court — Cayenne did 90 seconds of work with 18+ web search calls. It keeps searching even after finding relevant content, burning tokens and time.

### Date source preference differs
Mini tends to extract from `pdf-content` (6/10 courts), while Full leans toward `page-text` (5/10 courts). This is likely because Full's low reasoning makes it consider page update dates as "more recent" than PDF-internal dates, even when the PDF date is more authoritative.

## Conclusion

GPT-5.4 full with low effort is **not worth the 8x cost and 4x time increase**. It wins on a few courts (Cayenne, Amiens) but loses on others (Lyon, Besançon) and the wins are marginal. The better path is to improve Mini's reliability through:
1. `allowed_domains` filter (already implemented)
2. Better instructions
3. Retry logic for failed courts

Mini with `allowed_domains` remains the best value: $0.007/court, 11s/court.
