import { runCourtSearchMini } from "../lib/run-court-search-mini.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

// The 5 divergent courts + Paris as control
const COURTS = ["Paris", "Lyon", "Bordeaux", "Amiens", "Angers", "Besançon"];
const CONCURRENCY = 5;

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

console.log(`\nGPT-5.4 Mini — Smart fallback instructions\n${"=".repeat(60)}\n`);
const start = Date.now();
const results = await runBatch(COURTS, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.usage.total.inputTokens; totalOut += r.usage.total.outputTokens; }
const totalCost = (totalIn / 1e6) * 0.75 + (totalOut / 1e6) * 4.5;

console.log(`\n${"=".repeat(60)}`);
console.log(`Done: ${results.filter(r => r.success).length}/${results.length} pass | ${batchTime}s | $${totalCost.toFixed(4)}\n`);

// Compare: old Mini (rigid) vs new Mini (smart) vs Sonnet vs ground truth
const oldMini: Record<string, string> = {
  "Paris": "2026-03-10", "Lyon": "2025-11-21", "Bordeaux": "2025-01-01",
  "Amiens": "2022-12-05", "Angers": "2025-11-18", "Besançon": "2013-03-20",
};
const sonnet: Record<string, string> = {
  "Paris": "2026-03-10", "Lyon": "2026-01-15", "Bordeaux": "2025-07-01",
  "Amiens": "2026-02-01", "Angers": "2026-03-20", "Besançon": "2024-01-01",
};
const groundTruth: Record<string, string> = {
  "Paris": "2026-03-10 (PDF:MAJ)", "Lyon": "2025-11-21 (PDF:assembly)",
  "Bordeaux": "~2025-07 (no exact)", "Amiens": "~2026-02 (no exact)",
  "Angers": "2025-11-18 OR 2026-03-20", "Besançon": "~2026-02-24 (page)",
};

console.log("| Court | Old Mini (rigid) | New Mini (smart) | Sonnet | Ground truth |");
console.log("|-------|-----------------|-----------------|--------|-------------|");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const newDate = r.result?.publicationDate || "null";
  const source = r.result?.publicationDateSource || "—";
  console.log(`| ${r.court} | ${oldMini[r.court] || "?"} | ${newDate} (${source}) | ${sonnet[r.court] || "?"} | ${groundTruth[r.court] || "?"} |`);
}

console.log("\n--- Detailed ---");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  console.log(`\n${r.court}:`);
  if (r.result) {
    console.log(`  date: ${r.result.publicationDate} (${r.result.publicationDateSource})`);
    console.log(`  dateExplanation: ${r.result.dateExtractionExplanation.slice(0, 200)}`);
  } else {
    console.log(`  Error: ${r.error}`);
  }
}
