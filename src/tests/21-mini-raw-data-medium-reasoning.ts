import { runCourtSearchMini } from "../lib/run-court-search-mini.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

// Divergent courts + Paris as control
const COURTS = ["Paris", "Lyon", "Bordeaux", "Amiens", "Angers", "Besançon"];
const CONCURRENCY = 5;

async function runBatch(courts: string[]): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];
  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] ${court}...`);
      const r = await runCourtSearchMini(court);
      const cost = ((r.usage.total.inputTokens / 1e6) * 0.75 + (r.usage.total.outputTokens / 1e6) * 4.5).toFixed(4);
      if (r.success) {
        console.log(`[W${id}] ✓ ${court} — ${r.result!.publicationDate} (${r.result!.publicationDateSource}) [$${cost}] [${(r.timing.totalMs / 1000).toFixed(0)}s]`);
      } else {
        console.log(`[W${id}] ✗ ${court} — ${r.error?.slice(0, 60)} [${(r.timing.totalMs / 1000).toFixed(0)}s]`);
      }
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, courts.length) }, (_, i) => worker(i + 1)));
  return results;
}

console.log(`\nMini: raw data to extraction + medium reasoning\n${"=".repeat(60)}\n`);
const start = Date.now();
const results = await runBatch(COURTS);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

const ground: Record<string, string> = {
  "Paris": "2026-03-10 (PDF:MAJ)", "Lyon": "2025-11-21 (PDF:assembly)",
  "Bordeaux": "~2025-07 (URL path)", "Amiens": "~2026-02 (URL path)",
  "Angers": "2025-11-18 or 2026-03-20", "Besançon": "~2026-02-24 (page)",
};
const oldMini: Record<string, string> = {
  "Paris": "2026-03-10", "Lyon": "2025-11-21", "Bordeaux": "2025-01-01",
  "Amiens": "2022-12-05", "Angers": "2025-11-18", "Besançon": "2013-03-20",
};

console.log(`\n${"=".repeat(60)}`);
console.log(`Done in ${batchTime}s\n`);

console.log("| Court | Old Mini (none, summary) | New Mini (medium, raw) | Ground truth |");
console.log("|-------|------------------------|----------------------|-------------|");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const date = r.result?.publicationDate || "null";
  const src = r.result?.publicationDateSource || "—";
  console.log(`| ${r.court} | ${oldMini[r.court]} | ${date} (${src}) | ${ground[r.court]} |`);
}

console.log("\n--- Explanations ---");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  if (r.result) {
    console.log(`\n${r.court}: ${r.result.dateExtractionExplanation.slice(0, 300)}`);
  }
}
