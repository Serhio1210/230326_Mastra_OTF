# Three-Step Workflow Architecture

**Date**: 2026-03-25

---

## Problem with current approach

The current agent runs all 5 instruction steps however it wants — no enforcement, no checkpoints, no go/no-go decisions. The model can skip web search, cram everything into one turn, or give up after 2 turns. When something goes wrong, we can't tell WHERE it failed because there's no clear boundary between "found the page" and "reading the PDF."

## Proposed: 3-step pipeline with checkpoints

### Step 1: DISCOVER (Agent + web_search with open_page)

**What**: Find the court's expert page and identify the PDF.
**How**: `web_search` tool with reasoning (effort=medium). The model searches, opens pages, follows links, reads PDFs — all via built-in `open_page` and `find_in_page` sub-actions. Structured output enforces the return shape.
**Input**: Court name
**Output**:
```typescript
{
  found: boolean;
  pageUrl: string | null;
  pdfUrl: string | null;
  pdfTitle: string | null;
  searchExplanation: string;
  errors: string[];
}
```
**Checkpoint**: If `found === false` → STOP. No PDF, no point continuing.

### Step 2: COLLECT (Deterministic — no LLM)

**What**: Gather ALL date signals from every source into one clean object.
**How**: Pure function — fetches page HTML with cheerio, extracts PDF text with unpdf, parses URL paths, extracts filename dates, collects page text dates. No LLM reasoning.
**Input**: `pageUrl`, `pdfUrl` from Step 1
**Output**:
```typescript
{
  pdfText: string;
  pdfPageCount: number;
  pageTitle: string;
  pageText: string;
  filename: string;
  allDateSignals: Array<{
    source: "pdf-content" | "page-text" | "link-text" | "filename" | "url-path";
    raw: string;
    extracted: string | null;  // parsed YYYY-MM-DD
  }>;
  errors: string[];
}
```
**Why no LLM**: This step is pure data collection and parsing. Dates in URL paths (`/2026-02/`) and filenames (`MAJ 10 MARS 26`) can be extracted deterministically with regex. The LLM's job is to DECIDE, not to PARSE.

### Step 3: DECIDE (LLM with structured output — no tools)

**What**: Look at all date signals and pick the best one.
**How**: One LLM call with `responses.parse()` + `zodTextFormat`. Clean prompt with all pre-parsed signals listed. No tools, no conversation history.
**Input**: All date signals from Step 2 + raw PDF text for context
**Output**: `ExpertFinderResult` (date, source, explanation)

**Why LLM**: Some date signals are ambiguous — "assemblée du 18 novembre 2025" vs "mise à jour : 20/03/2026". The LLM understands French dates, knows which is more recent, and can explain its reasoning.

**Regex + raw text fallback**: DECIDE receives both the pre-parsed signals from COLLECT (fast, deterministic) AND the raw page/PDF text. This is critical because regex won't catch every format — assembly dates buried in sentences, decree dates, or unexpected patterns. The LLM checks the raw text for anything the regex missed, so we get the best of both: deterministic parsing where it works + LLM judgment where it doesn't.

---

## Bug fix: COLLECT overrides DISCOVER's PDF selection

**Problem**: DISCOVER uses `open_page` inside `web_search` to find the PDF. But `open_page` is a black box — the model grabs whatever PDF it finds first from search results. In testing, Paris DISCOVER returned `ANNUPARIS 2026.pdf` from `/2026-01/` (January) instead of `ANNUPARIS MAJ 10 MARS 26_2.pdf` from `/2026-03/` (March — the latest). The pipeline still got the right date because page text had it, but `documentUrl` pointed to an older PDF.

**Fix**: COLLECT now independently scrapes the page with cheerio, extracts ALL PDF links, classifies them by relevance (expert-list vs unrelated), and picks the one with the most recent URL path date. If COLLECT finds a newer PDF than DISCOVER returned, it overrides it. The trace shows `⚠ PDF OVERRIDDEN` with both URLs when this happens.

**Why this is the right layer**: DISCOVER's job is to find the page — it doesn't need to be perfect about which PDF. COLLECT's job is deterministic data collection — it sees all the PDFs on the page and can compare them mechanically. This separation means DISCOVER can be fast and approximate, while COLLECT is thorough and precise.

---

## Implementation (Native OpenAI SDK)

File: `src/lib/run-court-search-3step.ts`

### What each step sees and produces

```
Court: "Paris"
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 1: DISCOVER                                        │
│ web_search with reasoning (effort=medium)               │
│ Built-in: search → open_page → find_in_page             │
│ allowed_domains: [justice.fr, ...]                       │
│ Structured output via zodTextFormat                      │
│                                                         │
│ Output: {                                               │
│   found: true,                                          │
│   pageUrl: "cours-appel.justice.fr/paris/experts...",    │
│   pdfUrl: "...ANNUPARIS MAJ 10 MARS 26_2.pdf",         │
│   pdfTitle: "ANNUAIRE DES EXPERTS"                      │
│ }                                                       │
└───────────────────────┬─────────────────────────────────┘
                        ↓ found? YES → continue
┌─────────────────────────────────────────────────────────┐
│ Step 2: COLLECT (no LLM — deterministic)                │
│ fetch page HTML → cheerio parse → date hints            │
│ fetch PDF → unpdf extract → date patterns               │
│ parse URL path → "/2026-03/" → 2026-03-01               │
│ parse filename → "MAJ 10 MARS 26" → 2026-03-10         │
│                                                         │
│ Output: {                                               │
│   allDateSignals: [                                     │
│     { source: "pdf-content", raw: "MAJ LE 10/03/2026", │
│       extracted: "2026-03-10" },                        │
│     { source: "page-text", raw: "mise à jour : 10/03", │
│       extracted: "2026-03-10" },                        │
│     { source: "filename", raw: "10 mars 26",           │
│       extracted: "2026-03-10" },                        │
│     { source: "url-path", raw: "/2026-03/",            │
│       extracted: "2026-03-01" }                         │
│   ]                                                     │
│ }                                                       │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: DECIDE (LLM, no tools)                          │
│ Clean prompt with pre-parsed signals                    │
│ Structured output via zodTextFormat                     │
│ Reasoning effort: low                                   │
│                                                         │
│ Output: {                                               │
│   publicationDate: "2026-03-10",                        │
│   publicationDateSource: "pdf-content",                 │
│   dateExtractionExplanation: "MAJ LE 10/03/2026        │
│     confirmed by page text and filename"                │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Test results

### Paris — 14.2s, $0.0073, correct

| Step | Duration | Tokens | What happened |
|---|---|---|---|
| DISCOVER | 10.0s | 17.6K | search → open_page (experts page) → open_page (PDF) |
| COLLECT | 1.6s | 0 | 11 date signals parsed deterministically |
| DECIDE | 2.5s | 1.7K | Picked pdf-content 2026-03-10, confirmed by page-text + filename |

### Besançon — 25.6s, $0.0157, correct (previously flaky)

| Step | Duration | Tokens | What happened |
|---|---|---|---|
| DISCOVER | 22.1s | 39.3K | 10 searches on legacy site failed → open_page on homepage → navigated to experts subpage → open_page on PDF |
| COLLECT | 0.6s | 0 | 2 date signals: page-text 2026-02-24, url-path 2026-02-01 |
| DECIDE | 2.9s | 1.4K | Picked page-text 2026-02-24 (more specific than url-path) |

Key: Besançon succeeded because `open_page` let the model navigate from the homepage to the experts subpage after search failed to return the deep link. This was impossible in the old pipeline.

---

## Why this is better

| Problem | Old pipeline | 3-step pipeline |
|---|---|---|
| Can't tell where it failed | Agent returns text blob | Each step has typed input/output + trace |
| Model skips web search | Instructions say "always search" but model ignores | DISCOVER uses web_search with reasoning — always searches |
| Besançon flaky | Search doesn't find deep link, agent spirals | open_page navigates from homepage to subpage |
| Date parsing inconsistent | LLM parses URL paths and filenames differently each run | COLLECT does it deterministically with regex |
| Expensive LLM for parsing | LLM wastes tokens on "/2026-03/" → "2026-03-01" | COLLECT is free (no tokens) |
| Structured output garbling | 2-step hack (agent → extraction call) | DECIDE is clean prompt with pre-parsed signals |
| Debug visibility | Trace shows tool calls but not what model decided | Each step shows input, output, search actions, signals |

---

## Key discovery: web_search open_page

The 3-step architecture leverages a capability we discovered during this workstream: the `web_search` tool has built-in `open_page` and `find_in_page` sub-actions when used with reasoning models (effort >= medium). This means:

- No need for custom `fetchPage` tool — `open_page` reads pages
- No need for custom `extractPdfDate` tool — `open_page` reads PDFs
- The model can follow links from homepage → subpage (solves Besançon)
- All of this happens inside a single `web_search_call`

Custom tools (cheerio, unpdf) are still used in COLLECT for deterministic parsing, but DISCOVER no longer needs them.
