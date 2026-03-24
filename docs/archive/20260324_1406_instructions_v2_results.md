# Instructions v2: Generic, Clear, Results

**Date**: 2026-03-24 14:06 UTC

---

## What changed

Rewrote agent instructions to be:
- **Generic** — no hardcoded French date examples, teaches the agent HOW to think not WHAT to see
- **Clear about data sources** — explicitly lists all 5 date signal types
- **Critical rule** — "a year-only mention must never override a more specific date from any other source"
- **Shared** — same instructions for Sonnet and Mini via `instructions.ts`

## Results: Mini with v2 instructions

| Court | v1 (rigid) | v2 (generic) | Change |
|---|---|---|---|
| Paris | 2026-03-10 | 2026-03-10 | Same (correct) |
| Lyon | 2025-11-21 | 2025-11-21 | Same (correct) |
| Angers | 2025-11-18 | 2025-11-18 | **Fixed** (was 2026-11-18 year typo in v1.5) |
| Besançon | 2013-03-20 | 2026-01-01 | **Improved** (from ancient to current year) |
| Amiens | 2022-12-05 | null | **Regressed** (agent couldn't find PDF this run) |
| Bordeaux | 2025-01-01 | 2025-01-01 | Same (year-only, no URL path parsing) |

## What the agent sees (confirmed from toModelOutput)

The fetchPage toModelOutput sends:
```
Title: Experts judiciaires | Cour d'appel de Bordeaux
PDF links (2):
  - [likely-expert-list] "Liste des experts 2025" → https://...justice.fr/sites/default/files/2025-07/EXPERTS - 2025_0.pdf
Date hints from page: (none or "mise à jour : DD/MM/YYYY")
```

The full URL IS visible to the agent — `/2025-07/` is right there. But Mini at effort:none doesn't reason about URL structure. It reads the PDF text, sees "POUR L'ANNEE 2025", returns `2025-01-01`.

## Remaining issues

### 1. Mini doesn't parse URL path dates
The URL `/sites/default/files/2025-07/` clearly means July 2025. But Mini at effort:none treats URLs as opaque strings — it doesn't extract the `2025-07` path segment. This is a reasoning limitation at effort:none.

**Possible fix**: Extract the path date in the toModelOutput itself (deterministic, no LLM needed) and present it as a separate field: `URL path date: 2025-07`.

### 2. Amiens is flaky
The agent sometimes can't find the PDF URL — it varies by run. The page has a quirky URL structure. This is a search reliability issue, not an instructions issue.

### 3. Besançon page-text date not used
The page says "mise à jour : 24/02/2026" but the agent returns `2026-01-01` from the PDF. The toModelOutput date hint regex might not be matching. Need to verify the regex captures it.

## Next steps

The most impactful fix would be extracting the URL path date in `toModelOutput` — it's deterministic (no LLM reasoning needed) and would give Mini the date signal it's missing.
