/**
 * Test 23: Traced comparison across 10 courts.
 * Runs Mini agent through Mastra with full tracing.
 * Saves per-court traces + summary comparison.
 */
import { tracedCourtSearch, printTrace, type AgentTrace } from "../lib/trace-court-search.ts";

const COURTS = [
  "Paris",
  "Lyon",
  "Angers",
  "Besançon",
  "Bordeaux",
  "Amiens",
  "Aix-en-Provence",
  "Rennes",
  "Cayenne",
  "Grenoble",
];

const CONCURRENCY = 3; // Lower to avoid rate limits

const ground: Record<string, string> = {
  "Paris": "2026-03-10", "Lyon": "2025-11-21", "Angers": "2026-03-20",
  "Besançon": "~2026-02-24", "Bordeaux": "~2025-07", "Amiens": "~2026-02",
  "Aix-en-Provence": "2025-12-10", "Rennes": "2026-03-04",
  "Cayenne": "2022-11-23", "Grenoble": "2026-02-26",
};

async function runBatch(courts: string[], concurrency: number): Promise<AgentTrace[]> {
  const results: AgentTrace[] = [];
  const queue = [...courts];

  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] ${court}...`);
      const trace = await tracedCourtSearch(court);
      const cost = (trace.totalUsage.inputTokens / 1e6) * 0.75 + (trace.totalUsage.outputTokens / 1e6) * 4.5;
      if (trace.result) {
        console.log(`[W${id}] ✓ ${court} — ${trace.result.publicationDate} (${trace.result.publicationDateSource}) [$${cost.toFixed(4)}] [${(trace.totalMs / 1000).toFixed(0)}s] [${trace.steps.length} turns]`);
      } else {
        console.log(`[W${id}] ✗ ${court} — ${trace.error?.slice(0, 60)} [${(trace.totalMs / 1000).toFixed(0)}s]`);
      }
      results.push(trace);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, courts.length) }, (_, i) => worker(i + 1)));
  return results;
}

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Traced Comparison — 10 Courts                      ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Agent: expert-search-mini (Mastra)`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

const start = Date.now();
const results = await runBatch(COURTS, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

// Summary
let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.totalUsage.inputTokens; totalOut += r.totalUsage.outputTokens; }
const totalCost = (totalIn / 1e6) * 0.75 + (totalOut / 1e6) * 4.5;

console.log(`\n${"═".repeat(100)}`);
console.log(`RESULTS — ${results.filter(r => r.result).length}/${results.length} pass | ${batchTime}s | $${totalCost.toFixed(4)}`);
console.log("═".repeat(100));

console.log("\n| Court | Date | Source | Turns | Time | Tokens | Cost | Ground truth |");
console.log("|-------|------|--------|-------|------|--------|------|-------------|");

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const date = r.result?.publicationDate || "FAIL";
  const source = r.result?.publicationDateSource || "—";
  const turns = r.steps.length;
  const time = (r.totalMs / 1000).toFixed(0) + "s";
  const tokens = `${r.totalUsage.inputTokens}+${r.totalUsage.outputTokens}`;
  const cost = ((r.totalUsage.inputTokens / 1e6) * 0.75 + (r.totalUsage.outputTokens / 1e6) * 4.5).toFixed(4);
  const gt = ground[r.court] || "?";
  console.log(`| ${r.court} | ${date} | ${source} | ${turns} | ${time} | ${tokens} | $${cost} | ${gt} |`);
}

// Save traces
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
for (const trace of results) {
  const slug = trace.court.toLowerCase().replace(/[^a-z]/g, "");
  const path = `docs/archive/trace-${slug}-${timestamp}.json`;
  await Bun.write(path, JSON.stringify({
    ...trace,
    rawToolData: {
      ...trace.rawToolData,
      pageText: trace.rawToolData.pageText.slice(0, 2000),
      pdfText: trace.rawToolData.pdfText.slice(0, 1500),
    },
  }, null, 2));
}

// Save summary
const summaryPath = `docs/archive/traced-comparison-${timestamp}.json`;
await Bun.write(summaryPath, JSON.stringify(results.map(r => ({
  court: r.court,
  date: r.result?.publicationDate,
  source: r.result?.publicationDateSource,
  turns: r.steps.length,
  timeMs: r.totalMs,
  tokens: r.totalUsage,
  cost: (r.totalUsage.inputTokens / 1e6) * 0.75 + (r.totalUsage.outputTokens / 1e6) * 4.5,
  error: r.error,
  groundTruth: ground[r.court],
})), null, 2));

console.log(`\nTraces: docs/archive/trace-{court}-${timestamp}.json`);
console.log(`Summary: ${summaryPath}`);
