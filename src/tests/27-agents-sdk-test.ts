/**
 * Test 27: 3-Step Pipeline with OpenAI Agents SDK
 *
 * Built-in tracing → visible at platform.openai.com/traces
 * Plus local console output for immediate debugging.
 *
 * Usage: bun src/tests/27-agents-sdk-test.ts [court]
 */
import { runCourtSearchAgents } from "../lib/run-court-search-agents.ts";

const court = process.argv[2] || "Paris";

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  3-Step Pipeline — OpenAI Agents SDK                ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Court: ${court}`);
console.log(`  Tracing: platform.openai.com/traces`);
console.log(`  Started: ${new Date().toISOString()}\n`);

const start = Date.now();
const { success, result, collect, error } = await runCourtSearchAgents(court);
const elapsed = Date.now() - start;

if (success && result) {
  console.log(`✓ Success in ${(elapsed / 1000).toFixed(1)}s\n`);

  console.log(`── RESULT ──`);
  console.log(`  Date: ${result.publicationDate}`);
  console.log(`  Source: ${result.publicationDateSource}`);
  console.log(`  Page URL: ${result.pageUrl}`);
  console.log(`  PDF URL: ${result.documentUrl}`);
  console.log(`  PDF title: ${result.documentTitle}`);
  console.log(`  Reasoning: ${result.dateExtractionExplanation?.slice(0, 300)}`);
  if (result.errors?.length) console.log(`  Errors: ${result.errors.join("; ")}`);

  if (collect) {
    console.log(`\n── COLLECT ──`);
    console.log(`  Page: ${collect.pageTitle}`);
    console.log(`  PDF: ${collect.filename} (${collect.pdfPageCount} pages)`);
    console.log(`  PDFs on page: ${collect.pdfLinksOnPage} (${collect.expertPdfUrls.length} expert)`);
    if (collect.pdfOverridden) console.log(`  ⚠ PDF overridden by COLLECT`);
    console.log(`  Date signals: ${collect.allDateSignals.length}`);
    for (const s of collect.allDateSignals) {
      console.log(`    ${s.extracted ? "✓" : "✗"} [${s.source}] "${s.raw}" → ${s.extracted || "unparsed"}`);
    }
    if (collect.errors.length) console.log(`  Errors: ${collect.errors.join("; ")}`);
  }
} else {
  console.log(`✗ Failed in ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  Error: ${error}`);
}

console.log(`\n  Check traces: https://platform.openai.com/traces`);
