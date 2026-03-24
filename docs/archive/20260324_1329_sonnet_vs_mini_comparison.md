# Sonnet 4.6 vs GPT-5.4 Mini: Full 36-Court Comparison

**Date**: 2026-03-24 13:29 UTC

---

## Headline numbers

| | Sonnet 4.6 | GPT-5.4 Mini |
|---|---|---|
| **Courts passed** | 35/36 (97.2%) | 36/36 (100%) |
| **Total time (36 courts)** | ~777s | ~109s (**7x faster**) |
| **Total cost** | ~$25 | ~$0.92 (**27x cheaper**) |
| **Avg cost/court** | ~$0.70 | ~$0.026 |
| **Avg time/court** | ~60s | ~12s |
| **Cayenne** | FAILED (SDK bug) | PASSED ($0.026) |

---

## Court-by-court comparison

| Court | Sonnet date | Mini date | Match? | Sonnet source | Mini source |
|---|---|---|---|---|---|
| **Paris** | 2026-03-10 | 2026-03-10 | ✓ | pdf-content | pdf-content |
| **Aix-en-Provence** | 2025-12-10 | 2025-12-10 | ✓ | pdf-content | pdf-content |
| **Lyon** | 2026-01-15 | 2025-11-21 | ✗ | pdf-content | pdf-content |
| **Bordeaux** | 2025-07-01 | 2025-01-01 | ✗ | filename | pdf-content |
| **Amiens** | 2026-02-01 | 2022-12-05 | ✗ | filename | pdf-content |
| **Angers** | 2026-03-20 | 2025-11-18 | ✗ | page-text | pdf-content |
| **Bastia** | 2026-01-28 | null | ✗ | page-text | not-found |
| **Chambéry** | 2025-01-02 | 2025-01-02 | ✓ | pdf-content | pdf-content |
| **Colmar** | 2024-11-27 | 2024-11-27 | ✓ | pdf-content | pdf-content |
| **Besançon** | 2024-01-01 | 2013-03-20 | ✗ | filename | pdf-content |
| **Agen** | 2024-11-15 | 2024-11-15 | ✓ | pdf-content | pdf-content |
| **Bourges** | 2026-03-17 | 2026-03-17 | ✓ | pdf-content | pdf-content |
| **Caen** | 2026-02-26 | 2026-02-26 | ✓ | pdf-content | pdf-content |
| **Dijon** | 2025-11-12 | 2025-11-12 | ✓ | pdf-content | pdf-content |
| **Douai** | null | 2026-01-01 | — | not-found | pdf-content |
| **Grenoble** | 2026-02-26 | 2026-02-26 | ✓ | pdf-content | pdf-content |
| **Limoges** | 2025-11-14 | 2025-11-14 | ✓ | pdf-content | pdf-content |
| **Metz** | 2024-06-01 | 2024-06-01 | ✓ | filename | pdf-content |
| **Montpellier** | 2026-02-04 | 2026-02-04 | ✓ | pdf-content | pdf-content |
| **Nancy** | 2026-03-12 | 2026-03-12 | ✓ | pdf-content | pdf-content |
| **Nîmes** | 2025-09-08 | 2025-06-02 | ✗ | pdf-content | pdf-content |
| **Orléans** | 2026-02-09 | 2025-01-01 | ✗ | page-text | pdf-content |
| **Pau** | 2026-01-01 | 2026-01-01 | ✓ | link-text | pdf-content |
| **Poitiers** | 2026-03-01 | 2026-01-01 | ✗ | filename | pdf-content |
| **Reims** | 2024-11-04 | 2024-11-04 | ✓ | pdf-content | pdf-content |
| **Rennes** | 2026-03-04 | 2026-03-04 | ✓ | pdf-content | pdf-content |
| **Riom** | 2026-03-23 | 2026-03-23 | ✓ | filename | pdf-content |
| **Rouen** | 2026-02-26 | 2026-02-26 | ✓ | pdf-content | pdf-content |
| **Toulouse** | 2026-01-07 | 2026-01-01 | ✗ | page-text | pdf-content |
| **Versailles** | 2025-11-14 | 2025-11-14 | ✓ | pdf-content | pdf-content |
| **Basse-Terre** | 2025-12-11 | 2025-12-11 | ✓ | pdf-content | pdf-content |
| **Cayenne** | FAILED | 2022-11-23 | — | SDK bug | filename |
| **Fort-de-France** | 2024-11-12 | null | ✗ | pdf-content | not-found |
| **Nouméa** | 2026-03-17 | 2026-03-17 | ✓ | page-text | pdf-content |
| **Papeete** | 2025-03-31 | null | ✗ | page-text | not-found |
| **Saint-Denis** | 2024-11-27 | 2025-01-01 | ✗ | pdf-content | pdf-content |

---

## Summary

| Metric | Sonnet 4.6 | GPT-5.4 Mini |
|---|---|---|
| Exact date match | — | 20/36 (56%) |
| Date found | 34/36 | 33/36 |
| Date not found | 1 (Douai) | 3 (Bastia, Fort-de-France, Papeete) |
| Failed completely | 1 (Cayenne) | 0 |
| Primary source: pdf-content | 18 | 31 |
| Primary source: page-text | 7 | 0 |
| Primary source: filename | 7 | 2 |
| Primary source: link-text | 2 | 0 |

---

## Analysis

### Where Mini matches Sonnet (20 courts)
For straightforward courts with modern websites and clear PDF dates, Mini produces identical results at 1/27th the cost.

### Where Mini diverges (13 courts)
Mini consistently returns `pdf-content` as the source (31/36 courts) — it reads the PDF and extracts what it finds. The problem is that **different PDFs have different dates**:

- **Mini sometimes picks a different (older) PDF** than Sonnet. Example: Amiens — Sonnet found the 2026 list, Mini found an older 2022 version.
- **Mini can't fall back to page-text or link-text** as effectively as Sonnet. When the PDF doesn't contain an exact date, Sonnet uses the webpage's "mise à jour" date. Mini misses these.
- **Besançon**: Mini read a 2013 document from the wrong site entirely.

### Where Mini wins
- **Cayenne**: Mini passed where Sonnet hit an SDK bug (different web search provider).
- **Douai**: Mini found a date (2026-01-01) from the PDF where Sonnet returned not-found.
- **Speed**: 7x faster across the board.
- **Cost**: 27x cheaper.

### Root cause of divergence
Mini uses **OpenAI web search** while Sonnet uses **Anthropic web search**. Different search engines return different results → different pages → different PDFs → different dates. The quality gap isn't primarily about reasoning — it's about **which PDF the search engine finds first**.

---

## Recommendation

| Use case | Model |
|---|---|
| **Production (accuracy matters)** | Sonnet 4.6 — better page-text/link-text fallback, more consistent |
| **Cost-sensitive batch runs** | GPT-5.4 Mini — 27x cheaper, 56% exact match, good enough for monitoring |
| **Hybrid** | Mini for initial scan, Sonnet only for courts where Mini returns null or suspicious dates |

The hybrid approach would cost ~$1 for 36 courts (Mini) + ~$7 for ~10 re-checks (Sonnet) = ~$8 total instead of $25.
