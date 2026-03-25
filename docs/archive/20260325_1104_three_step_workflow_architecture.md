# Three-Step Workflow Architecture

**Date**: 2026-03-25 11:04 UTC

---

## Problem with current approach

The current agent runs all 5 instruction steps however it wants — no enforcement, no checkpoints, no go/no-go decisions. The model can skip web search, cram everything into one turn, or give up after 2 turns. When something goes wrong, we can't tell WHERE it failed because there's no clear boundary between "found the page" and "reading the PDF."

## Proposed: 3-step pipeline with checkpoints

### Step 1: DISCOVER (Agent + tools)

**What**: Find the court's expert page and identify the PDF.
**How**: Agent with `web_search` (forced via `toolChoice` on first turn) + `fetchPage`.
**Input**: Court name
**Output**:
```typescript
{
  found: boolean;
  pageUrl: string | null;
  pdfUrl: string | null;
  pdfTitle: string | null;
  pageText: string;        // raw page text for date signals
  pdfLinks: Array<{ url, text, relevanceHint }>;
}
```
**Checkpoint**: If `found === false` → STOP. No PDF, no point continuing.

### Step 2: COLLECT (Deterministic — no LLM)

**What**: Gather ALL date signals from every source into one clean object.
**How**: Pure `execute` function — calls `extractPdfDate`, parses URL path, extracts filename dates, collects page text dates. No LLM reasoning.
**Input**: `pdfUrl`, `pageText`, `pdfLinks` from step 1
**Output**:
```typescript
{
  pdfText: string;              // first 5 pages of PDF
  pageText: string;             // from the court page
  pdfUrl: string;               // full URL with path dates
  filename: string;             // decoded filename
  urlPathDate: string | null;   // extracted from URL path (e.g. "2026-02")
  allDateSignals: Array<{
    source: string;             // "pdf-content", "page-text", "filename", "url-path"
    raw: string;                // the raw text containing the date
    extracted: string | null;   // parsed YYYY-MM-DD if possible
  }>;
}
```
**Why no LLM**: This step is pure data collection and parsing. Dates in URL paths (`/2026-02/`) and filenames (`MAJ 10 MARS 26`) can be extracted deterministically. The LLM's job is to DECIDE, not to PARSE.

### Step 3: DECIDE (LLM with structured output — no tools)

**What**: Look at all date signals and pick the best one.
**How**: One LLM call with `Output.object` + native structured output. Clean prompt with all signals laid out clearly. No tools, no conversation history.
**Input**: All date signals from step 2
**Output**: `ExpertFinderResult` (date, source, explanation)

**Why LLM**: Some date signals are ambiguous — "assemblée du 18 novembre 2025" vs "mise à jour : 20/03/2026". The LLM understands French dates, knows which is more recent, and can explain its reasoning.

---

## Mastra workflow implementation

```typescript
const workflow = createWorkflow({
  id: 'expert-search',
  inputSchema: z.object({ court: z.string() }),
  outputSchema: expertFinderResultSchema,
})
  .then(discoverStep)       // Step 1: agent finds the page + PDF
  .branch([
    [({ inputData }) => !inputData.found, stopStep],     // not found → stop
    [({ inputData }) => inputData.found, collectStep],   // found → collect signals
  ])
  .then(decideStep)         // Step 3: LLM picks the date
  .commit()
```

### Step types

| Step | Type | LLM? | Tools? | Mastra pattern |
|---|---|---|---|---|
| **Discover** | Agent step | Yes | web_search + fetchPage | `createStep(agent, { structuredOutput })` |
| **Collect** | Deterministic step | No | extractPdfDate (tool) | `createStep({ execute })` |
| **Decide** | LLM step | Yes | None | `createStep({ execute })` calling `generateText` |

### What each step sees and produces

```
Court: "Paris"
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 1: DISCOVER                                        │
│ Agent + web_search (forced) + fetchPage                 │
│ toolChoice: web_search on turn 0                        │
│ allowed_domains: [justice.fr, ...]                      │
│                                                         │
│ Output: {                                               │
│   found: true,                                          │
│   pageUrl: "cours-appel.justice.fr/paris/experts...",    │
│   pdfUrl: "...ANNUPARIS MAJ 10 MARS 26_2.pdf",         │
│   pageText: "mise à jour : 10/03/2026..."               │
│ }                                                       │
└───────────────────────┬─────────────────────────────────┘
                        ↓ found? YES → continue
┌─────────────────────────────────────────────────────────┐
│ Step 2: COLLECT (no LLM)                                │
│ extractPdfDate(pdfUrl) → pdfText                        │
│ parse URL path → "2026-03"                              │
│ parse filename → "MAJ 10 MARS 26"                       │
│ extract page date hints → "mise à jour : 10/03/2026"   │
│                                                         │
│ Output: {                                               │
│   allDateSignals: [                                     │
│     { source: "pdf-content", raw: "MAJ LE 10/03/2026"} │
│     { source: "page-text", raw: "mise à jour : 10/03"} │
│     { source: "filename", raw: "MAJ 10 MARS 26" }      │
│     { source: "url-path", raw: "/2026-03/" }            │
│   ]                                                     │
│ }                                                       │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: DECIDE (LLM, no tools)                          │
│ Clean prompt with all signals                           │
│ Native structured output → ExpertFinderResult           │
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

## Why this is better than current approach

| Problem | Current | Workflow |
|---|---|---|
| Model skips web search | Instructions say "always search" but model ignores | `toolChoice` enforces it |
| Can't tell where it failed | Agent returns text blob | Each step has typed input/output |
| Model decides the flow | 5 steps in instructions, model does whatever | Workflow enforces step order |
| Date extraction mixed with discovery | Agent does everything | Step 2 collects, Step 3 decides |
| Expensive LLM for parsing | LLM parses URL paths and filenames | Step 2 does it deterministically |
| Structured output garbling | 2-step hack (agent → extraction) | Step 3 is clean prompt, no tools, no history |

---

## What we need to build

1. `discoverStep` — agent with `web_search` + `fetchPage`, structured output for step 1 result
2. `collectStep` — deterministic `execute` function calling `extractPdfDate` + parsing logic
3. `decideStep` — `execute` function calling `generateText` with `Output.object`
4. Workflow wiring with `.then()` + `.branch()`
5. Register workflow in Mastra
6. Test endpoint
