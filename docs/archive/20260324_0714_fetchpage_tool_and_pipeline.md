# fetchPage Tool & Full Pipeline

**Date**: 2026-03-24 07:14 UTC

---

## What we built

### fetchPage tool (`src/mastra/tools/fetchpage/index.ts`)
- Uses cheerio to parse HTML from a given URL
- Extracts all PDF links with anchor text
- Tags each PDF with a relevance hint: `likely-expert-list`, `possible-expert-list`, `not-expert-list`, `unknown`
- Returns full page text (up to 10k chars) for the agent to analyze for dates
- No LLM involved — pure deterministic HTML parsing

### Agent update
- Added fetchPage as a tool alongside `webSearch_20260209`
- Updated instructions: agent now searches → fetches the actual page → picks the most recent PDF → extracts date
- Agent decides which PDF is the directory (not speeches/declarations) and which has the most recent date

---

## Key finding: web search returns stale data

| | Web search only (Phase 1) | Web search + fetchPage (Phase 3) |
|---|---|---|
| **PDF found** | `ANNUEXPERTS2025_2.pdf` | `ANNUPARIS MAJ 10 MARS 26_2.pdf` |
| **Date** | `2025-01-01` (guessed from path) | **`2026-03-10`** (exact, from filename) |
| **Gap** | 14 months behind | Current |

The web search index had cached the January 2025 version. The actual page had been updated to March 2026. **fetchPage reads truth from the source, not from the search index.**

---

## Why the agent picks the PDF (not the tool)

fetchPage returns all PDFs with relevance hints. The agent decides which one is the expert directory because:
- Some courts have multiple PDFs (speeches, declarations, forms)
- The selection requires reasoning about text, filenames, and dates
- A fixed ranking algorithm would break for edge cases

---

## Test results

### 02-fetch-page.test.ts (tool unit test)
```
2 pass, 0 fail, 17 expect() calls — 381ms
```
- Paris experts page returns 11 PDFs, 4 tagged `likely-expert-list`
- Invalid URL returns error correctly

### 03-full-pipeline.test.ts (agent end-to-end)
```
1 pass, 0 fail, 13 expect() calls — 46.42s
```
- Agent finds official page, calls fetchPage, picks March 2026 PDF
- Date `2026-03-10` extracted from filename `MAJ 10 MARS 26`
- All assertions pass including `publicationDate.startsWith("2026")`

---

## Files

| File | Purpose |
|---|---|
| `src/mastra/tools/fetchpage/index.ts` | fetchPage tool |
| `src/mastra/agents/expert-search.ts` | Agent with web search + fetchPage |
| `src/tests/02-fetch-page.test.ts` | Tool unit test |
| `src/tests/02-fetch-page.ts` | Manual test script |
| `src/tests/03-full-pipeline.test.ts` | End-to-end pipeline test |
| `src/tests/03-full-pipeline.ts` | Manual pipeline test script |
