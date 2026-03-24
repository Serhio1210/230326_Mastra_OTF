# extractPdfDate Tool & Priority Chain Correction

**Date**: 2026-03-24 07:36 UTC

---

## Key insight: PDF content is the official truth

The date inside the PDF is the **authoritative legal date**. The page text, filename, and link text are secondary — they reflect CMS metadata, not the official document.

Example from the Paris PDF first page:
```
COUR D'APPEL DE PARIS LISTE DES EXPERTS JUDICIAIRES ANNEE 2026 MAJ LE 10/03/2026
```

This is the date that matters legally. Not the filename, not the webpage "mise à jour" date.

## Corrected priority chain

```
1. pdf-content  ← OFFICIAL TRUTH (what the document says)
2. page-text    ← CMS metadata (when the page was updated)
3. link-text    ← anchor text on the link
4. filename     ← whatever the clerk named the file
5. not-found    ← fallback
```

Previous priority had `page-text` and `filename` first and `pdf-content` as a fallback. This was wrong — it treated the most authoritative source as a last resort.

## extractPdfDate tool

- Uses `unpdf` library — pure programmatic PDF text extraction, no LLM
- Reads first 3 pages (dates are always at the start)
- Returns raw text for the agent to find date patterns
- Runs in ~2 seconds

## Structured output hang fix

When combining 3 tools (web search + fetchPage + extractPdfDate) with structured output, the structuring step (2nd LLM call) timed out with Sonnet 4.6. The agent's text response with full tool call history was too large.

**Fix**: Use Haiku 4.5 for the structuring step — fast, cheap, and the extraction task is simple.

```typescript
structuredOutput: {
  schema: expertFinderResultSchema,
  model: "anthropic/claude-haiku-4-5",  // fast model for structuring
}
```

## Test results

### 04-extract-pdf-date.test.ts (tool unit test)
```
2 pass, 0 fail, 8 expect() calls — 2.02s
```

### 05-full-pipeline-with-pdf.test.ts (full pipeline)
```
1 pass, 0 fail, 11 expect() calls — 64.94s
```
- `publicationDate`: `2026-03-10`
- `publicationDateSource`: `pdf-content`
- Agent found the PDF, read its content, extracted the official date

## Court date patterns observed

| Court | Filename date | Page text date | PDF content date |
|---|---|---|---|
| Paris | MAJ 10 MARS 26 | mise à jour : 10/03/2026 | MAJ LE 10/03/2026 |
| Aix-en-Provence | Décembre 2025 | mise à jour : 19/02/2026 | (not tested yet) |
| Besançon | 2026 (year only) | mise à jour : 24/02/2026 | (not tested yet) |

The PDF content consistently has the most precise and authoritative date.
