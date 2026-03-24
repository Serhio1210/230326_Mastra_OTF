import { runCourtSearchMini } from "../lib/run-court-search-mini.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

// Courts where Mini (effort: none) diverged from Sonnet
const DIVERGENT_COURTS = [
  "Lyon",           // Mini: 2025-11-21, Sonnet: 2026-01-15
  "Bordeaux",       // Mini: 2025-01-01, Sonnet: 2025-07-01
  "Amiens",         // Mini: 2022-12-05, Sonnet: 2026-02-01
  "Angers",         // Mini: 2025-11-18, Sonnet: 2026-03-20
  "Besançon",       // Mini: 2013-03-20, Sonnet: 2024-01-01
];

const EFFORT = "medium" as const;
const CONCURRENCY = 5;

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];

  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] Starting: ${court}`);
      const result = await runCourtSearchMini(court, EFFORT);
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

console.log(`\nGPT-5.4 Mini (effort: ${EFFORT}) — Divergent courts\n${"=".repeat(60)}\n`);
const start = Date.now();
const results = await runBatch(DIVERGENT_COURTS, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.usage.total.inputTokens; totalOut += r.usage.total.outputTokens; }
const totalCost = (totalIn / 1e6) * 0.75 + (totalOut / 1e6) * 4.5;

console.log(`\n${"=".repeat(60)}`);
console.log(`Done: ${results.filter(r => r.success).length}/${results.length} pass | ${batchTime}s | $${totalCost.toFixed(4)}\n`);

console.log("| Court | effort:none date | effort:medium date | Sonnet date | Improved? |");
console.log("|-------|------------------|-------------------|-------------|-----------|");

const noneResults: Record<string, string> = {
  "Lyon": "2025-11-21", "Bordeaux": "2025-01-01", "Amiens": "2022-12-05",
  "Angers": "2025-11-18", "Besançon": "2013-03-20",
};
const sonnetResults: Record<string, string> = {
  "Lyon": "2026-01-15", "Bordeaux": "2025-07-01", "Amiens": "2026-02-01",
  "Angers": "2026-03-20", "Besançon": "2024-01-01",
};

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const medDate = r.result?.publicationDate || "null";
  const noneDate = noneResults[r.court] || "?";
  const sonDate = sonnetResults[r.court] || "?";
  const improved = medDate === sonDate ? "✓ MATCH" : medDate !== noneDate ? "~ changed" : "✗ same";
  console.log(`| ${r.court} | ${noneDate} | ${medDate} | ${sonDate} | ${improved} |`);
}

console.log("\n--- Detailed results ---");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  console.log(`\n${r.court}:`);
  if (r.result) console.log(JSON.stringify(r.result, null, 2));
  else console.log(`Error: ${r.error}`);
}

const path = `docs/archive/mini-medium-divergent-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await Bun.write(path, JSON.stringify({ effort: EFFORT, results, batchTime, totalCost }, null, 2));
console.log(`\nSaved: ${path}`);
