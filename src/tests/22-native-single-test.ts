/**
 * Single-court test with full trace output.
 * Shows every step, tool call, and decision the agent made.
 *
 * Usage: bun src/tests/22-native-single-test.ts [court] [effort]
 * Example: bun src/tests/22-native-single-test.ts Paris
 *          bun src/tests/22-native-single-test.ts Besançon medium
 */
import { runCourtSearchNative, type AgentTrace } from "../lib/run-court-search-native.ts";

const court = process.argv[2] || "Paris";
const effort = (process.argv[3] || "none") as "none" | "low" | "medium" | "high";

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Native OpenAI SDK — Full Trace                     ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Court: ${court}`);
console.log(`  Model: gpt-5.4-mini`);
console.log(`  Effort: ${effort}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

const trace = await runCourtSearchNative(court, effort);

// ── Print agent steps ───────────────────────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log(`AGENT LOOP — ${trace.steps.length} turns`);
console.log("═".repeat(70));

for (const step of trace.steps) {
  console.log(`\n── Turn ${step.turn} (${(step.durationMs / 1000).toFixed(1)}s) ──`);
  console.log(`  API response types: [${step.outputItemTypes.join(", ")}]`);
  console.log(`  Tokens: in=${step.usage.inputTokens} out=${step.usage.outputTokens}`);

  for (const event of step.events) {
    switch (event.type) {
      case "web_search":
        console.log(`  🔍 Web search (id: ${event.id})`);
        break;

      case "function_call":
        console.log(`  📞 Call ${event.name}(${JSON.stringify(event.arguments)})`);
        break;

      case "function_result": {
        const status = event.fullResult?.success ? "✓" : "✗";
        console.log(`  📦 ${status} ${event.name} result (${event.durationMs}ms)`);

        // Show key details based on tool type
        if (event.name === "fetchPage" && event.fullResult?.success) {
          console.log(`     Title: ${event.fullResult.title}`);
          console.log(`     PDFs found: ${event.fullResult.pdfLinks?.length || 0}`);
          for (const pdf of event.fullResult.pdfLinks || []) {
            console.log(`       [${pdf.relevanceHint}] "${pdf.text?.slice(0, 60)}" → ${pdf.url}`);
          }
          if (event.fullResult.dateHints?.length) {
            console.log(`     Date hints: ${event.fullResult.dateHints.join("; ")}`);
          }
        } else if (event.name === "extractPdfDate" && event.fullResult?.success) {
          console.log(`     Pages: ${event.fullResult.pageCount}`);
          console.log(`     Text preview: ${event.fullResult.pdfText?.slice(0, 200)}...`);
        } else if (!event.fullResult?.success) {
          console.log(`     Error: ${event.fullResult?.error}`);
        }
        break;
      }

      case "model_text":
        console.log(`  💬 Agent says:`);
        // Print with indentation, truncate long texts
        const lines = event.text.slice(0, 800).split("\n");
        for (const line of lines) {
          console.log(`     ${line}`);
        }
        if (event.text.length > 800) console.log(`     ... (${event.text.length} chars total)`);
        break;
    }
  }
}

// ── Print extraction step ───────────────────────────────────────────

if (trace.extraction) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`EXTRACTION STEP (${(trace.extraction.durationMs / 1000).toFixed(1)}s)`);
  console.log("═".repeat(70));
  console.log(`  Tokens: in=${trace.extraction.usage.inputTokens} out=${trace.extraction.usage.outputTokens}`);

  if (trace.extraction.result) {
    const r = trace.extraction.result;
    console.log(`\n  Result:`);
    console.log(`    Court: ${r.courtName}`);
    console.log(`    Date: ${r.publicationDate}`);
    console.log(`    Source: ${r.publicationDateSource}`);
    console.log(`    Page URL: ${r.pageUrl}`);
    console.log(`    PDF URL: ${r.documentUrl}`);
    console.log(`    PDF title: ${r.documentTitle}`);
    console.log(`    Search: ${r.searchExplanation?.slice(0, 200)}`);
    console.log(`    Date reasoning: ${r.dateExtractionExplanation?.slice(0, 300)}`);
    if (r.errors?.length) console.log(`    Errors: ${r.errors.join("; ")}`);
  }
}

// ── Print summary ───────────────────────────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log(`SUMMARY`);
console.log("═".repeat(70));
console.log(`  Status: ${trace.error ? `✗ ${trace.error}` : "✓ Success"}`);
console.log(`  Date: ${trace.result?.publicationDate || "none"} (${trace.result?.publicationDateSource || "n/a"})`);
console.log(`  Total time: ${(trace.totalMs / 1000).toFixed(1)}s`);
console.log(`  Agent turns: ${trace.steps.length}`);
console.log(`  Total tokens: in=${trace.totalUsage.inputTokens} out=${trace.totalUsage.outputTokens}`);

const cost = (trace.totalUsage.inputTokens * 0.075 + trace.totalUsage.outputTokens * 4.5) / 1_000_000;
console.log(`  Cost: $${cost.toFixed(4)}`);

// ── Save full trace to file ─────────────────────────────────────────

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const filename = `docs/archive/trace-${court.toLowerCase().replace(/[^a-z]/g, "")}-${timestamp}.json`;

// Save trace but trim large text fields in fullResult for readability
const saveTrace = {
  ...trace,
  steps: trace.steps.map((s) => ({
    ...s,
    events: s.events.map((e) => {
      if (e.type === "function_result" && e.fullResult) {
        return {
          ...e,
          fullResult: {
            ...e.fullResult,
            pageText: e.fullResult.pageText?.slice(0, 2000),
            pdfText: e.fullResult.pdfText?.slice(0, 1500),
          },
        };
      }
      return e;
    }),
  })),
};

await Bun.write(filename, JSON.stringify(saveTrace, null, 2));
console.log(`\n  Full trace saved to: ${filename}`);
