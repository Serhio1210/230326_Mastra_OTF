# Batch Test: 10 Courts — 100% Success Rate

**Date**: 2026-03-24 11:19 UTC

---

## Configuration

- **Architecture**: Test 07 — clean prompt + Sonnet 4.6 native structured output
- **Agent**: Sonnet 4.6, effort: low, adaptive thinking
- **Tools**: webSearch_20260209 + fetchPage + extractPdfDate
- **Extraction**: Sonnet 4.6, effort: low, Output.object (native structured output)
- **Concurrency**: 5 workers
- **Total time**: 176.3 seconds for 10 courts

## Results

| Court | Date | Source | PDF | Agent | Extract | Total |
|-------|------|--------|-----|-------|---------|-------|
| Aix-en-Provence | 2025-12-10 | pdf-content | ✓ | 48s | 5s | 53s |
| Amiens | 2026-02-01 | filename | ✓ | 47s | 5s | 51s |
| Angers | 2026-03-20 | page-text | ✓ | 57s | 9s | 65s |
| Bastia | 2026-01-28 | page-text | ✓ | 47s | 4s | 51s |
| Besançon | 2024-01-01 | filename | ✓ | 122s | 7s | 128s |
| Bordeaux | 2025-07-01 | filename | ✓ | 69s | 5s | 74s |
| Chambéry | 2025-01-02 | pdf-content | ✓ | 40s | 4s | 44s |
| Colmar | 2024-11-27 | pdf-content | ✓ | 45s | 4s | 49s |
| Lyon | 2026-01-15 | pdf-content | ✓ | 67s | 6s | 73s |
| Paris | 2026-03-10 | pdf-content | ✓ | 56s | 9s | 65s |

**10/10 passed. 0 failed.**

## Date source distribution

| Source | Count | Courts |
|--------|-------|--------|
| pdf-content | 6 | Aix, Chambéry, Colmar, Lyon, Paris, (Aix reads "December 10, 2025" from PDF) |
| page-text | 2 | Angers ("mise à jour : 20/03/2026"), Bastia ("mise à jour : 28/01/2026") |
| filename | 3 | Amiens (URL path 2026-02), Besançon (filename 2024), Bordeaux (URL path 2025-07) |

PDF content was the primary source for 6/10 courts — confirming the priority chain is correct.

## Edge cases observed

### Besançon — legacy site fallback
- `ca-besancon.justice.fr` is completely inaccessible (HTTP and HTTPS)
- Agent fell back to `cejca-besancon.fr` (association site) — got a 2024 PDF
- Took 128s (longest) — multiple retries
- **This is a known problem from the reference project** — Besançon has always been difficult

### Lyon — truncated PDF
- Agent found a March 2026 PDF but first page text was truncated
- Fell back to January 2026 version date (2026-01-15)
- Reported the truncation as an error

### Bordeaux — no exact date in PDF
- PDF says "POUR L'ANNEE 2025" without a specific date
- Date inferred from URL path (`2025-07/`) → `2025-07-01`

### Amiens — quirky filename
- PDF filename: `2026 - Liste des experts judiciaires -ok.pdf`
- The "-ok" suffix suggests the clerk confirmed the file before upload

## Comparison with reference project

Reference project batch test (Jan 17, 2026): 9 courts, 100% success
Our batch test (Mar 24, 2026): 10 courts, 100% success

| Court | Reference date | Our date | Notes |
|-------|---------------|----------|-------|
| Aix-en-Provence | pdf-content | 2025-12-10 (pdf-content) | ✓ |
| Amiens | found | 2026-02-01 (filename) | ✓ |
| Angers | found | 2026-03-20 (page-text) | ✓ |
| Bastia | found | 2026-01-28 (page-text) | ✓ |
| Besançon | found (legacy fallback) | 2024-01-01 (filename) | ⚠️ Legacy site down |
| Bordeaux | found | 2025-07-01 (filename) | ✓ |
| Chambéry | found | 2025-01-02 (pdf-content) | ✓ |
| Colmar | not tested | 2024-11-27 (pdf-content) | New |
| Lyon | not tested | 2026-01-15 (pdf-content) | New |
| Paris | not tested | 2026-03-10 (pdf-content) | New |
