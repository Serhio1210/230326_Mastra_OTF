# Architecture Review & Instructions Fix Plan

**Date**: 2026-03-24 13:52 UTC

---

## Current architecture: what happens at each step

### Step 1: Agent (search + tools)

```
Model:    Sonnet 4.6 (effort: low, adaptive thinking)
          OR GPT-5.4 Mini (effort: none)
Tools:    web_search + fetchPage + extractPdfDate
Input:    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de {court}..."
Output:   Free text summary of findings
Receives: Tool results via toModelOutput (compact: PDF links, date hints, first 500 chars of PDF)
```

The agent decides:
- What to search for
- Which URL to fetch
- Which PDF to pick
- Whether to read the PDF
- How to interpret the date

This is a multi-turn loop (3-5 tool calls). The agent sees compact tool results thanks to `toModelOutput`.

### Step 2: Extraction (structured output)

```
Model:    Sonnet 4.6 (effort: low, adaptive thinking, native structured output)
          OR GPT-5.4 Mini (effort: none, structured output)
Tools:    NONE
Input:    Clean prompt with agent's text summary (first 3000 chars)
Output:   ExpertFinderResult JSON matching Zod schema
Receives: Only the agent's summary — no conversation history, no tool results
```

The extraction model:
- Reads a clean, focused prompt
- Fills the schema fields
- Native structured output guarantees valid JSON

---

## The problem: agent instructions are too rigid on date sourcing

Current instructions say:

```
The date inside the PDF is the AUTHORITATIVE source.
ALWAYS use extractPdfDate — the PDF content is the official truth.
```

This causes:
- Agent stubbornly returns a vague year from PDF ("POUR L'ANNEE 2026" → `2026-01-01`) when the page text has an exact date ("mise à jour : 24/02/2026")
- Agent returns an assembly date from months ago when a more recent filename date exists
- Mini ignores page-text and filename signals because instructions say "PDF is truth"

### Ground truth revealed: PDF is NOT always the best source

From our 5-court ground truth test:

| Court | PDF content says | Page text says | Filename says | Best date |
|---|---|---|---|---|
| Lyon | "assemblée...14 et 21 novembre 2025" | — | `2026 - Liste des experts` | 2025-11-21 (PDF) |
| Bordeaux | "POUR L'ANNEE 2025" (no exact date) | — | `EXPERTS - 2025_0.pdf` in `/2025-07/` | 2025-07-01 (path) |
| Amiens | "POUR L'ANNEE 2026" (no exact date) | — | `2026 - Liste des experts -ok.pdf` in `/2026-02/` | 2026-02-01 (path) |
| Angers | "assemblée...18 novembre 2025" | "mise à jour : 20/03/2026" | `LISTE EXPERTS 2026.pdf` in `/2026-03/` | 2026-03-20 (page) |
| Besançon | "LISTE DES EXPERTS POUR 2026" (no date) | "mise à jour : 24/02/2026" | in `/2026-02/` | 2026-02-24 (page) |

**The correct priority is: most specific and most recent date wins, regardless of source.**

---

## Instructions fix needed

### Current priority (too rigid):
```
1. pdf-content (ALWAYS preferred)
2. page-text
3. link-text
4. filename
5. not-found
```

### Corrected priority (smart fallback):
```
1. Exact date from PDF content ("MAJ LE 10/03/2026", "arrêtée au 14 janvier 2025") → pdf-content
2. Exact date from page text ("mise à jour : 24/02/2026") → page-text
3. Exact date from link text ("MAJ : janvier 2026") → link-text
4. Exact date from filename ("ANNUPARIS MAJ 10 MARS 26_2.pdf") → filename
5. Month from URL path ("/2026-02/" → 2026-02-01) → filename
6. Year only from PDF ("POUR L'ANNEE 2026" → 2026-01-01) → pdf-content
7. not-found
```

Key change: **a year-only date from the PDF should NOT override an exact date from the page text or filename.** The agent should use the most precise date available, then report where it came from.

### Remove "ALWAYS use extractPdfDate"

The agent should still call extractPdfDate, but if the PDF only has a year, it should check page text and filename for a more precise date. The instruction "ALWAYS use extractPdfDate — the PDF content is the official truth" needs to become:

"Always call extractPdfDate to check the PDF. If the PDF has an exact date (day/month/year), use it — it's the most authoritative. If the PDF only has a year, use the most specific date from page text, link text, or filename instead."

---

## What does NOT change

- **Architecture**: 2-step (agent → extraction) stays the same
- **Tools**: fetchPage, extractPdfDate stay the same
- **toModelOutput**: stays the same
- **Extraction step**: clean prompt + native structured output stays the same
- **Models**: Sonnet or Mini choice stays the same

---

## What changes

1. **Agent instructions**: smarter date priority chain
2. **Agent instructions**: remove "ALWAYS" on PDF truth
3. **Extraction prompt**: clarify that the agent should have already picked the best date
4. **Validation**: compare agent results against reference data in `docs/reference-data/courts-verified.json`

---

## Models in use

| Step | Sonnet pipeline | Mini pipeline |
|---|---|---|
| **Agent** | `anthropic("claude-sonnet-4-6")` effort: low, adaptive thinking | `openai("gpt-5.4-mini")` effort: none |
| **Web search** | `anthropic.tools.webSearch_20260209` (dynamic filtering) | `openai.tools.webSearch` |
| **Tools** | fetchPage (cheerio), extractPdfDate (unpdf) | Same |
| **Extraction** | `anthropic("claude-sonnet-4-6")` Output.object, effort: low | `openai("gpt-5.4-mini")` Output.object |
| **Cost/court** | ~$0.70 | ~$0.026 |
| **Time/court** | ~60-80s | ~12s |
| **Accuracy** | 35/36 (1 SDK bug) | 36/36 (56% date match with Sonnet) |
