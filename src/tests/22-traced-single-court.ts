/**
 * Single-court test with full trace output.
 * Shows every step, tool call, and decision the agent made.
 *
 * Usage: bun src/tests/22-traced-single-court.ts [court] [agent]
 * Example: bun src/tests/22-traced-single-court.ts Paris
 *          bun src/tests/22-traced-single-court.ts Besançon expert-search-mini
 */
import { tracedCourtSearch, printTrace } from "../lib/trace-court-search.ts";

const court = process.argv[2] || "Paris";
const agentId = process.argv[3] || "expert-search-mini";

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Traced Court Search (Mastra)                       ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Court: ${court}`);
console.log(`  Agent: ${agentId}`);
console.log(`  Started: ${new Date().toISOString()}`);

const trace = await tracedCourtSearch(court, agentId);

printTrace(trace);

// Save full trace
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const filename = `docs/archive/trace-${court.toLowerCase().replace(/[^a-z]/g, "")}-${timestamp}.json`;
const saveTrace = {
  ...trace,
  rawToolData: {
    ...trace.rawToolData,
    pageText: trace.rawToolData.pageText.slice(0, 2000),
    pdfText: trace.rawToolData.pdfText.slice(0, 1500),
  },
};
await Bun.write(filename, JSON.stringify(saveTrace, null, 2));
console.log(`\n  Trace saved: ${filename}`);
