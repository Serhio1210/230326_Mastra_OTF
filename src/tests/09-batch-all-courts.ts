import { runCourtSearch, type CourtSearchResult } from "../lib/run-court-search.ts";

// All 36 French cours d'appel
const ALL_COURTS = {
  // Already tested (batch 0)
  tested: [
    "Paris", "Aix-en-Provence", "Besançon", "Amiens", "Angers",
    "Bordeaux", "Bastia", "Chambéry", "Colmar", "Lyon",
  ],
  // Batch 1: Metropolitan
  batch1: ["Agen", "Bourges", "Caen", "Dijon", "Douai"],
  // Batch 2: Metropolitan
  batch2: ["Grenoble", "Limoges", "Metz", "Montpellier", "Nancy"],
  // Batch 3: Metropolitan
  batch3: ["Nîmes", "Orléans", "Pau", "Poitiers", "Reims"],
  // Batch 4: Metropolitan
  batch4: ["Rennes", "Riom", "Rouen", "Toulouse", "Versailles"],
  // Batch 5: Overseas
  batch5: ["Basse-Terre", "Cayenne", "Fort-de-France", "Nouméa", "Papeete", "Saint-Denis"],
};

const CONCURRENCY = 5;

// Pick which batch to run from CLI: bun src/tests/09-batch-all-courts.ts 1
const batchArg = process.argv[2] || "1";
const batchKey = `batch${batchArg}` as keyof typeof ALL_COURTS;
const courts = ALL_COURTS[batchKey];

if (!courts) {
  console.log("Usage: bun src/tests/09-batch-all-courts.ts <batch>");
  console.log("Available batches:", Object.keys(ALL_COURTS).join(", "));
  process.exit(1);
}

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${workerId}] Starting: ${court}`);
      const result = await runCourtSearch(court);

      if (result.success) {
        console.log(`[W${workerId}] ✓ ${court} — ${result.result!.publicationDate} (${result.result!.publicationDateSource}) [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
      } else {
        console.log(`[W${workerId}] ✗ ${court} — FAILED: ${result.error?.slice(0, 100)} [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
      }

      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, courts.length) }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  return results;
}

// Run
console.log(`\nBatch ${batchArg}: ${courts.length} courts, ${CONCURRENCY} concurrent\n${"=".repeat(60)}\n`);
const batchStart = Date.now();
const results = await runBatch(courts, CONCURRENCY);
const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);

// Summary
const succeeded = results.filter((r) => r.success);
const failed = results.filter((r) => !r.success);

console.log(`\n${"=".repeat(60)}`);
console.log(`Batch ${batchArg}: ${succeeded.length}/${results.length} passed | ${failed.length} failed | ${batchTime}s\n`);

console.log("| Court | Date | Source | PDF | Time |");
console.log("|-------|------|--------|-----|------|");

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  if (r.success && r.result) {
    const date = r.result.publicationDate || "null";
    const source = r.result.publicationDateSource;
    const pdf = r.result.documentUrl ? "✓" : "✗";
    const time = (r.timing.totalMs / 1000).toFixed(0) + "s";
    console.log(`| ${r.court} | ${date} | ${source} | ${pdf} | ${time} |`);
  } else {
    console.log(`| ${r.court} | FAILED | — | — | ${(r.timing.totalMs / 1000).toFixed(0)}s |`);
  }
}

// Failures detail
if (failed.length > 0) {
  console.log("\n--- FAILURES ---");
  for (const r of failed) {
    console.log(`\n${r.court}: ${r.error}`);
    if (r.agentText) console.log(`Agent: ${r.agentText.slice(0, 300)}`);
  }
}

// Detailed JSON
console.log(`\n${"=".repeat(60)}\nDETAILED RESULTS\n`);
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  console.log(`\n--- ${r.court} ---`);
  if (r.success && r.result) {
    console.log(JSON.stringify(r.result, null, 2));
  } else {
    console.log(`Error: ${r.error}`);
  }
}

// Save results
const outputPath = `docs/archive/batch${batchArg}-results-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await Bun.write(outputPath, JSON.stringify({ batch: batchArg, courts, results, batchTime }, null, 2));
console.log(`\nSaved to: ${outputPath}`);
