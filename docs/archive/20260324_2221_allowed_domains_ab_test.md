# allowed_domains Filter A/B Test

**Date**: 2026-03-24 22:21 UTC

---

## What we tested

The GA `web_search` tool in the OpenAI Responses API supports `filters.allowed_domains` — a list of domains the search engine is restricted to. We ran 6 courts with and without this filter to see if constraining search to official justice.fr domains improves results.

**Allowed domains list:**
- `cours-appel.justice.fr` (modern official platform)
- `courdecassation.fr` (hosts some courts' lists, especially overseas)
- `ca-papeete.justice.fr`, `ca-besancon.justice.fr`, `ca-noumea.justice.fr`, `ca-cayenne.justice.fr`, `ca-bastia.justice.fr` (legacy court domains)

## Results

| Court | Open (no filter) | Filtered | Winner |
|---|---|---|---|
| **Paris** | 2026-01-23 (old PDF) | **2026-03-10** (current PDF) | **Filtered** |
| **Besançon** | null (failed entirely) | **2026-02-24** (page-text) | **Filtered** |
| **Rennes** | 2021-10-15 (ancient 2021 PDF!) | **2026-03-04** (current PDF) | **Filtered** |
| Cayenne | 2022-11-23 | 2022-11-23 | Tie |
| Bordeaux | 2025-07-01 | 2025-07-01 | Tie |
| **Amiens** | **2026-02-01** (page MAJ) | 2022-12-05 (old decree in PDF) | **Open** |

**Score: Filtered wins 3, Open wins 1, Tie 2.**

## Root cause: wasted Turn 0

Without the filter, the agent's first action is to `fetchPage` on Google/Bing search URLs (e.g. `https://www.google.com/search?q=...`). This always returns 0 PDFs because it's parsing a search results HTML page, not a court page. The agent then scrambles and often lands on older PDFs from search results.

With the filter, the search tool only returns justice.fr URLs, so the agent goes straight to the right domain from Turn 0. This saves a full turn of tokens and time, and critically prevents the agent from finding stale content.

### Trace comparison: Rennes

**Open (got 2021 date):**
```
Turn 0: fetchPage(www.google.com), fetchPage(www.google.com)  ← wasted
Turn 1: 🔍 web_search, fetchPage(cours-appel.justice.fr)
Turn 2: 🔍 web_search, extractPdfDate(old 2021 PDF URL)       ← found old PDF
Turn 3: 💬 final
```

**Filtered (got 2026 date):**
```
Turn 0: fetchPage(cours-appel.justice.fr)                      ← straight to source
Turn 1: 🔍 web_search, fetchPage(cours-appel.justice.fr)
Turn 2: extractPdfDate(current 2026 PDF URL)                   ← found current PDF
Turn 3: 💬 final
```

### The one regression: Amiens

Filtered found the right page but extracted a 2022 decree date from the PDF instead of the "MAJ 02/2026" from the page text. This is an extraction-step issue (the model prioritized an exact date in the PDF over a month-only date on the page), not a search issue. The filter worked correctly — it found the right page and PDF.

## Timing

The filtered version is consistently faster (avg 12.5s vs 15.1s) because it doesn't waste Turn 0 on Google/Bing.

## Conclusion

`allowed_domains` is a net positive. It prevents the agent from wasting turns on search engine HTML pages and finding stale content from non-official sources. The one regression (Amiens) is an extraction-step problem, not a search problem.

This is a feature only available in the native OpenAI SDK — Mastra/AI SDK's `openai.tools.webSearch()` does not expose the `filters` parameter.
