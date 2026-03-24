# Ground Truth: 5 Divergent Courts

**Date**: 2026-03-24 13:43 UTC
**Method**: Direct page fetch + PDF read with our tools (no LLM)

---

## Results

### Lyon
- **Page**: cours-appel.justice.fr/lyon/les-experts — accessible
- **PDF**: `2026 - Liste des experts judiciaires.pdf` (355 pages, folder `2026-03/`)
- **PDF content**: "dressée par l'assemblée générale restreinte des magistrats des **14 et 21 novembre 2025**"
- **No "MAJ LE" or "mise à jour" date in PDF**
- **Ground truth**: `2025-11-21` (date of the assembly that approved the list)

| Model | Date | Correct? |
|---|---|---|
| Sonnet | 2026-01-15 | **Wrong** — no January date exists in the PDF |
| Mini | 2025-11-21 | **Correct** |
| GPT-5.4 | 2025-11-21 | **Correct** |

### Bordeaux
- **Page**: cours-appel.justice.fr/bordeaux/experts — accessible
- **PDF**: `EXPERTS - 2025_0.pdf` (426 pages, folder `2025-07/`)
- **PDF content**: "POUR L'ANNEE 2025" — no specific date, no MAJ, no assemblée date in first 5 pages
- **One PDF link points to intranet** (sitesca.intranet.justice.gouv.fr) — inaccessible
- **Ground truth**: No exact date available. Best approximation is `2025-07-01` from URL path.

| Model | Date | Correct? |
|---|---|---|
| Sonnet | 2025-07-01 | **Best available** (from URL path) |
| Mini | 2025-01-01 | **Wrong** — no January signal |
| GPT-5.4 | null | **Reasonable** (correctly reports no date found) |

### Amiens
- **Page**: cours-appel.justice.fr/amiens/les-experts-judiciaires... — accessible
- **PDF**: `2026 - Liste des experts judiciaires -ok.pdf` (270 pages, folder `2026-02/`)
- **PDF content**: "POUR L'ANNEE 2026" — no specific date, no MAJ, no assemblée date in first 5 pages
- **Ground truth**: No exact date available. Best approximation is `2026-02-01` from URL path.

| Model | Date | Correct? |
|---|---|---|
| Sonnet | 2026-02-01 | **Best available** (from URL path) |
| Mini | 2022-12-05 | **Wrong** — found an old decree date |
| GPT-5.4 | 2026-01-01 | **Reasonable** (from year in PDF) |

### Angers
- **Page**: cours-appel.justice.fr/angers/experts-judiciaires — accessible
- **Page date hint**: "mise à jour : 20/03/2026"
- **PDF**: `LISTE EXPERTS 2026.pdf` (165 pages, folder `2026-03/`)
- **PDF content**: "Assemblée générale des magistrats du siège de la cour d'appel du **18 novembre 2025**"
- **Ground truth**: Two valid dates exist:
  - `2025-11-18` — assembly date (when the list was approved)
  - `2026-03-20` — page update date (when the CMS was updated)

| Model | Date | Correct? |
|---|---|---|
| Sonnet | 2026-03-20 | **Correct** (page-text date — most recent update) |
| Mini | 2025-11-18 | **Correct** (PDF date — official assembly approval) |
| GPT-5.4 | 2025-11-18 | **Correct** (PDF date — official assembly approval) |

### Besançon
- **Page**: cours-appel.justice.fr/besancon/experts-judiciaires — **accessible** (it works now!)
- **Page date hint**: "mise à jour : 24/02/2026"
- **PDF**: `Annuaire experts 2026.pdf` (137 pages, folder `2026-02/`)
- **PDF content**: "LISTE DES EXPERTS POUR 2026" — no specific date, no MAJ, no assemblée date in first 5 pages
- **Ground truth**: No exact date in PDF. Page says `2026-02-24`.

| Model | Date | Correct? |
|---|---|---|
| Sonnet | 2024-01-01 | **Wrong** — found old data from legacy site |
| Mini | 2013-03-20 | **Wrong** — found ancient data |
| GPT-5.4 | null | **Reasonable** (couldn't access the page) |

**Note**: Besançon's modern site is NOW ACCESSIBLE. Both Sonnet and Mini found the wrong data because they fell back to legacy/association sites. The modern site has the 2026 annuaire.

---

## Summary

| Court | Ground truth | Sonnet | Mini | GPT-5.4 |
|---|---|---|---|---|
| Lyon | 2025-11-21 (assembly) | **Wrong** (2026-01-15) | **Correct** | **Correct** |
| Bordeaux | ~2025-07 (no exact date) | Best available | Wrong | Null (honest) |
| Amiens | ~2026-02 (no exact date) | Best available | Wrong | Reasonable |
| Angers | 2025-11-18 OR 2026-03-20 | Correct (page) | Correct (PDF) | Correct (PDF) |
| Besançon | ~2026-02-24 (page) | Wrong | Wrong | Null |

## Key insights

1. **Sonnet was wrong on Lyon** — it hallucinated a January 2026 date that doesn't exist. Mini and GPT-5.4 were correct.
2. **For Angers, both dates are valid** — the PDF date (assembly approval) and the page date (CMS update) are both real. It depends on what you mean by "publication date."
3. **Bordeaux and Amiens have no exact date in their PDFs** — only "POUR L'ANNEE 2025/2026." The URL path is the best approximation. Sonnet was best here because it used filename/path dates.
4. **Besançon's modern site is now accessible** — all three models got it wrong because they ran when the site was down or fell back to old sources. A re-run would likely succeed.
5. **No model is consistently right** — Sonnet won on 2 courts (Bordeaux, Amiens), Mini won on 1 (Lyon), and Angers is a tie. The "ground truth" itself is ambiguous for 3 of 5 courts.
