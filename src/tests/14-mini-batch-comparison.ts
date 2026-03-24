import { runCourtSearchMini } from "../lib/run-court-search-mini.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

const ALL_BATCHES: Record<string, string[]> = {
  "1": ["Paris", "Aix-en-Provence", "Lyon", "Bordeaux", "Amiens"],
  "2": ["Angers", "Bastia", "Chambéry", "Colmar", "Besançon"],
  "3": ["Agen", "Bourges", "Caen", "Dijon", "Douai"],
  "4": ["Grenoble", "Limoges", "Metz", "Montpellier", "Nancy"],
  "5": ["Nîmes", "Orléans", "Pau", "Poitiers", "Reims"],
  "6": ["Rennes", "Riom", "Rouen", "Toulouse", "Versailles"],
  "7": ["Basse-Terre", "Cayenne", "Fort-de-France", "Nouméa", "Papeete", "Saint-Denis"],
};

const CONCURRENCY = 5;
const batchArg = process.argv[2] || "1";
const courts = ALL_BATCHES[batchArg];

if (!courts) {
  console.log("Usage: bun src/tests/14-mini-batch-comparison.ts <batch 1-7>");
  console.log("Batches:", Object.keys(ALL_BATCHES).join(", "));
  process.exit(1);
}

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];

  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] Starting: ${court}`);
      const result = await runCourtSearchMini(court);
      if (result.success) {
        const cost = ((result.usage.total.inputTokens / 1e6) * 0.75 + (result.usage.total.outputTokens / 1e6) * 4.5).toFixed(4);
        console.log(`[W${id}] ✓ ${court} — ${result.result!.publicationDate} (${result.result!.publicationDateSource}) [$${cost}] [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
      } else {
        console.log(`[W${id}] ✗ ${court} — ${result.error?.slice(0, 80)} [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
      }
      results.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, courts.length) }, (_, i) => worker(i + 1)));
  return results;
}

console.log(`\nGPT-5.4 Mini — Batch ${batchArg}: ${courts.length} courts\n${"=".repeat(60)}\n`);
const start = Date.now();
const results = await runBatch(courts, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

const succeeded = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

// Token/cost totals
let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.usage.total.inputTokens; totalOut += r.usage.total.outputTokens; }
const totalCost = (totalIn / 1e6) * 0.75 + (totalOut / 1e6) * 4.5;

console.log(`\n${"=".repeat(60)}`);
console.log(`Batch ${batchArg}: ${succeeded.length}/${results.length} pass | ${batchTime}s | ${totalIn} in / ${totalOut} out | $${totalCost.toFixed(4)}\n`);

console.log("| Court | Date | Source | PDF | Tokens | Cost | Time |");
console.log("|-------|------|--------|-----|--------|------|------|");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  if (r.success && r.result) {
    const cost = ((r.usage.total.inputTokens / 1e6) * 0.75 + (r.usage.total.outputTokens / 1e6) * 4.5).toFixed(4);
    console.log(`| ${r.court} | ${r.result.publicationDate || "null"} | ${r.result.publicationDateSource} | ${r.result.documentUrl ? "✓" : "✗"} | ${r.usage.total.inputTokens}+${r.usage.total.outputTokens} | $${cost} | ${(r.timing.totalMs / 1000).toFixed(0)}s |`);
  } else {
    console.log(`| ${r.court} | FAILED | — | — | — | — | ${(r.timing.totalMs / 1000).toFixed(0)}s |`);
  }
}

if (failed.length > 0) {
  console.log("\n--- FAILURES ---");
  for (const r of failed) console.log(`${r.court}: ${r.error?.slice(0, 200)}`);
}

// Save
const path = `docs/archive/mini-batch${batchArg}-results-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await Bun.write(path, JSON.stringify({ batch: batchArg, courts, results, batchTime, totalCost }, null, 2));
console.log(`\nSaved: ${path}`);
