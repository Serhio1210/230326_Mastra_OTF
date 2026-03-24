# Roadmap: Expert Search Agent Improvements

**Date**: 2026-03-24 06:17 UTC
**Reference project**: `290126__Assertra_H2F_shared`
**Current state**: Basic Anthropic agent with `webSearch_20260209`, free-text output

---

## Phase 1 — Structured Output

**Goal**: Return validated, typed results instead of free text.

- [ ] Add Zod schema matching reference project (`courtName`, `pageUrl`, `documentUrl`, `publicationDate`, `publicationDateSource`, `errors`)
- [ ] Use Mastra's `structuredOutput` option on `agent.generate()`
- [ ] Test with Paris — verify output matches expected shape
- [ ] Commit

---

## Phase 2 — URL Verification Tool

**Goal**: Confirm that found URLs actually return HTTP 200.

- [ ] Create `verifyUrl` tool using `createTool` from `@mastra/core/tools`
- [ ] Check HTTP status code + content-type (application/pdf for PDFs)
- [ ] Add to agent tools
- [ ] Test with Paris — verify `pageVerified` and `documentVerified` fields
- [ ] Commit

---

## Phase 3 — Page Fetching Tool

**Goal**: Extract PDF links and page text from court pages, rather than relying only on web search snippets.

- [ ] Create `fetchPage` tool — fetches URL, extracts all PDF links with their anchor text
- [ ] Return `pdfLinks` array (url, text, likelyExpertList flag) + `pageText` summary
- [ ] Add to agent tools
- [ ] Update agent instructions to use fetchPage after finding candidate URLs
- [ ] Test with Paris — verify PDF links are extracted correctly
- [ ] Commit

---

## Phase 4 — Date Extraction

**Goal**: Find the publication date of the expert list with a clear priority chain.

- [ ] Add date extraction logic to agent instructions (priority: link-text → page-text → filename → pdf-content → not-found)
- [ ] Create `extractPdfDate` tool — downloads PDF, reads first 3 pages, extracts dates
- [ ] Track `publicationDateSource` in structured output
- [ ] Test with Paris — verify date matches reference (e.g. `2025-01-14`)
- [ ] Commit

---

## Phase 5 — Multi-Court Support

**Goal**: Search for any of the 36 French cours d'appel, not just Paris.

- [ ] Parameterise the agent prompt to accept a court name
- [ ] Add domain filtering in instructions (ignore `exjudis.fr`, `cncej.org`, prioritise `.justice.fr`)
- [ ] Handle legacy sites (`ca-[city].justice.fr`) + HTTP fallback
- [ ] Test with 3 courts: Paris, Aix-en-Provence, Besançon (modern + legacy patterns)
- [ ] Commit

---

## Phase 6 — Batch Testing

**Goal**: Run against multiple courts and verify results.

- [ ] Create batch test script that runs agent against N courts
- [ ] Compare results with reference project expected outputs
- [ ] Log success/failure rate, timing per court
- [ ] Commit

---

## Phase 7 — HTTP Endpoint

**Goal**: Expose the agent as a usable API.

- [ ] Verify Hono endpoint works at `/api/agents/expert-search-agent/generate`
- [ ] Add a dedicated route with court name as parameter
- [ ] Test via curl
- [ ] Commit

---

## Out of Scope (for now)

These exist in the reference project but are not planned for this repo:

- Inngest workflow orchestration
- Supabase database storage
- SvelteKit frontend / courts table UI
- Cloudflare Workers deployment
- Mastra Cloud observability / CloudExporter
- Multi-agent comparison (OpenAI vs Gemini vs Anthropic)

---

## Reference: Expected Output Schema

```typescript
const expertFinderResultSchema = z.object({
  courtName: z.string(),
  pageUrl: z.string().nullable(),
  pageVerified: z.boolean(),
  documentUrl: z.string().nullable(),
  documentTitle: z.string().nullable(),
  documentVerified: z.boolean(),
  publicationDate: z.string().nullable(),       // YYYY-MM-DD
  publicationDateSource: z.enum([
    'page-text', 'link-text', 'filename', 'pdf-content', 'not-found'
  ]),
  searchExplanation: z.string(),
  dateExtractionExplanation: z.string(),
  errors: z.array(z.string()),
});
```

## Reference: Expected Paris Result

```json
{
  "courtName": "Paris",
  "pageUrl": "https://www.cours-appel.justice.fr/paris/experts-judiciaires",
  "pageVerified": true,
  "documentUrl": "https://www.cours-appel.justice.fr/sites/default/files/2025-01/ANNUEXPERTS2025_2.pdf",
  "documentVerified": true,
  "publicationDate": "2025-01-14",
  "publicationDateSource": "pdf-content",
  "searchExplanation": "...",
  "dateExtractionExplanation": "...",
  "errors": []
}
```
