/**
 * Test 26: 3-Step Pipeline — full trace output
 *
 * Usage: bun src/tests/26-3step-pipeline-test.ts [court]
 */
import { runCourtSearch3Step, type PipelineTrace } from "../lib/run-court-search-3step.ts";

const court = process.argv[2] || "Paris";

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  3-Step Pipeline — Full Trace                       ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Court: ${court}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

const trace = await runCourtSearch3Step(court);

// ── Print each step ─────────────────────────────────────────────────

for (const step of trace.steps) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`STEP: ${step.name} (${(step.durationMs / 1000).toFixed(1)}s)`);
  console.log("═".repeat(70));

  if (step.usage) {
    console.log(`  Tokens: in=${step.usage.inputTokens} out=${step.usage.outputTokens}`);
  }

  // Step-specific output
  if (step.name === "DISCOVER") {
    const out = step.output as any;
    console.log(`\n  Found: ${out.found}`);
    console.log(`  Page URL: ${out.pageUrl}`);
    console.log(`  PDF URL: ${out.pdfUrl}`);
    console.log(`  PDF title: ${out.pdfTitle}`);
    console.log(`  Search: ${out.searchExplanation?.slice(0, 200)}`);
    if (out.errors?.length) console.log(`  Errors: ${out.errors.join("; ")}`);

    // Show web search actions
    if (step.debug?.searchActions?.length) {
      console.log(`\n  Web search actions (${step.debug.searchActions.length}):`);
      for (const sa of step.debug.searchActions) {
        const a = sa.action;
        if (a?.type === "search") {
          console.log(`    🔍 search: ${JSON.stringify(a.queries)}`);
        } else if (a?.type === "open_page") {
          console.log(`    📄 open_page: ${a.url}`);
        } else if (a?.type === "find_in_page") {
          console.log(`    🔎 find_in_page: "${a.pattern}"`);
        }
      }
    }
    if (step.debug?.outputItemTypes) {
      console.log(`  API response items: [${step.debug.outputItemTypes.join(", ")}]`);
    }
  }

  if (step.name === "COLLECT") {
    const out = step.output as any;
    console.log(`\n  Page title: ${out.pageTitle}`);
    console.log(`  PDF links on page: ${out.pdfLinksOnPage}`);
    if (out.expertPdfs?.length) {
      console.log(`  Expert PDFs found: ${out.expertPdfs.length}`);
      for (const url of out.expertPdfs) console.log(`    → ${url}`);
    }
    if (out.pdfOverridden) {
      console.log(`  ⚠ PDF OVERRIDDEN by COLLECT:`);
      console.log(`    DISCOVER found: ${out.discoverPdfUrl}`);
      console.log(`    COLLECT picked: ${out.bestPdfUrl}`);
    }
    console.log(`  Filename: ${out.filename}`);
    console.log(`  PDF pages: ${out.pdfPageCount}`);
    console.log(`  Date signals found: ${out.signalCount}`);

    if (out.signals?.length) {
      console.log(`\n  All date signals:`);
      for (const s of out.signals) {
        const check = s.extracted ? "✓" : "✗";
        console.log(`    ${check} [${s.source}] "${s.raw}" → ${s.extracted || "could not parse"}`);
      }
    } else {
      console.log(`  No date signals found!`);
    }
    if (out.errors?.length) console.log(`  Errors: ${out.errors.join("; ")}`);
  }

  if (step.name === "DECIDE") {
    const out = step.output as any;
    console.log(`\n  Date: ${out.publicationDate}`);
    console.log(`  Source: ${out.publicationDateSource}`);
    console.log(`  Reasoning: ${out.dateExtractionExplanation?.slice(0, 300)}`);
    console.log(`  Page URL: ${out.pageUrl}`);
    console.log(`  PDF URL: ${out.documentUrl}`);
    if (out.errors?.length) console.log(`  Errors: ${out.errors.join("; ")}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log(`RESULT`);
console.log("═".repeat(70));
console.log(`  Status: ${trace.error ? `✗ ${trace.error.slice(0, 100)}` : "✓ Success"}`);
console.log(`  Date: ${trace.result?.publicationDate || "none"} (${trace.result?.publicationDateSource || "n/a"})`);
console.log(`  Total time: ${(trace.totalMs / 1000).toFixed(1)}s`);
console.log(`  Steps: ${trace.steps.map((s) => `${s.name}(${(s.durationMs / 1000).toFixed(1)}s)`).join(" → ")}`);

const totalIn = trace.steps.reduce((sum, s) => sum + (s.usage?.inputTokens || 0), 0);
const totalOut = trace.steps.reduce((sum, s) => sum + (s.usage?.outputTokens || 0), 0);
console.log(`  Total tokens: in=${totalIn} out=${totalOut}`);
const cost = (totalIn * 0.075 + totalOut * 4.5) / 1_000_000;
console.log(`  Cost: $${cost.toFixed(4)}`);

// ── Save trace ──────────────────────────────────────────────────────

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const courtSlug = court.toLowerCase().replace(/[^a-z]/g, "");
const path = `docs/archive/trace-3step-${courtSlug}-${timestamp}.json`;
await Bun.write(path, JSON.stringify(trace, null, 2));
console.log(`\n  Trace saved: ${path}`);
