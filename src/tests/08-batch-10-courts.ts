import { runCourtSearch, type CourtSearchResult } from "../lib/run-court-search.ts";

// 10 courts: mix of modern sites, legacy sites, different date patterns
const COURTS = [
  "Paris",             // Modern, well-known
  "Aix-en-Provence",   // Modern, page-text date pattern
  "Besançon",          // Legacy site fallback (ca-besancon.justice.fr)
  "Amiens",            // Tested in reference project
  "Angers",            // Tested in reference project
  "Bordeaux",          // Tested in reference project
  "Bastia",            // Tested in reference project (Corsica)
  "Chambéry",          // Tested in reference project
  "Colmar",            // Not tested before
  "Lyon",              // Large court, not tested before
];

const CONCURRENCY = 5; // Run 5 at a time to avoid rate limits

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[Worker ${workerId}] Starting: ${court}`);
      const result = await runCourtSearch(court);

      if (result.success) {
        console.log(`[Worker ${workerId}] ✓ ${court} — ${result.result!.publicationDate} (${result.result!.publicationDateSource}) [${(result.timing.totalMs / 1000).toFixed(1)}s]`);
      } else {
        console.log(`[Worker ${workerId}] ✗ ${court} — FAILED: ${result.error} [${(result.timing.totalMs / 1000).toFixed(1)}s]`);
      }

      results.push(result);
    }
  }

  // Launch workers
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  return results;
}

// Run
console.log(`\nBatch test: ${COURTS.length} courts, ${CONCURRENCY} concurrent\n${"=".repeat(60)}\n`);
const batchStart = Date.now();

const results = await runBatch(COURTS, CONCURRENCY);

const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);

// Summary table
console.log(`\n${"=".repeat(60)}\n`);
console.log("RESULTS SUMMARY\n");

const succeeded = results.filter((r) => r.success);
const failed = results.filter((r) => !r.success);

console.log(`Total: ${results.length} | Passed: ${succeeded.length} | Failed: ${failed.length} | Time: ${batchTime}s\n`);

// Detailed results table
console.log("| Court | Date | Source | PDF URL | Agent | Extract | Total |");
console.log("|-------|------|--------|---------|-------|---------|-------|");

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  if (r.success && r.result) {
    const date = r.result.publicationDate || "null";
    const source = r.result.publicationDateSource;
    const pdf = r.result.documentUrl ? "✓" : "✗";
    const agent = (r.timing.agentMs / 1000).toFixed(0) + "s";
    const extract = (r.timing.extractionMs / 1000).toFixed(0) + "s";
    const total = (r.timing.totalMs / 1000).toFixed(0) + "s";
    console.log(`| ${r.court} | ${date} | ${source} | ${pdf} | ${agent} | ${extract} | ${total} |`);
  } else {
    const total = (r.timing.totalMs / 1000).toFixed(0) + "s";
    console.log(`| ${r.court} | FAILED | — | — | — | — | ${total} |`);
  }
}

// Detailed JSON for each court
console.log(`\n${"=".repeat(60)}\nDETAILED RESULTS\n`);

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  console.log(`\n--- ${r.court} ---`);
  if (r.success && r.result) {
    console.log(JSON.stringify(r.result, null, 2));
  } else {
    console.log(`Error: ${r.error}`);
    if (r.agentText) console.log(`Agent text: ${r.agentText}`);
  }
}

// Write results to file for reference
const outputPath = `docs/archive/batch-results-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await Bun.write(outputPath, JSON.stringify(results, null, 2));
console.log(`\nResults saved to: ${outputPath}`);
