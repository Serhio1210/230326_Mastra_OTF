/**
 * Test 25: GPT-5.4 full (agent=low, extraction=low) with allowed_domains
 * Matching the worktree's best config (9/10 agreement).
 */
import { runCourtSearchGPT54 } from "../lib/run-court-search-gpt54.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

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

const CONCURRENCY = 3;

// Worktree reference results (Full low/low with allowed_domains)
const worktreeRef: Record<string, string> = {
  "Paris": "2026-03-10",
  "Lyon": "2026-02-13",
  "Angers": "2026-03-20",
  "Besançon": "2026-02-24",
  "Bordeaux": "2025-07-01",
  "Amiens": "2026-02-01",
  "Aix-en-Provence": "2026-02-19",
  "Rennes": "2026-03-04",
  "Cayenne": "2022-11-23",
  "Grenoble": "2026-02-27",
};

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];

  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] ${court}...`);
      const r = await runCourtSearchGPT54(court);
      const cost = ((r.usage.total.inputTokens / 1e6) * 2.5 + (r.usage.total.outputTokens / 1e6) * 15).toFixed(4);
      if (r.success) {
        console.log(`[W${id}] ✓ ${court} — ${r.result!.publicationDate} (${r.result!.publicationDateSource}) [$${cost}] [${(r.timing.totalMs / 1000).toFixed(0)}s]`);
      } else {
        console.log(`[W${id}] ✗ ${court} — ${r.error?.slice(0, 80)} [${(r.timing.totalMs / 1000).toFixed(0)}s]`);
      }
      results.push(r);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, courts.length) }, (_, i) => worker(i + 1)));
  return results;
}

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  GPT-5.4 Full — low/low + allowed_domains           ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Agent: gpt-5.4 (effort: low)`);
console.log(`  Extraction: gpt-5.4 (effort: low)`);
console.log(`  Domains: justice.fr, gouv.fr, legacy courts`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

const start = Date.now();
const results = await runBatch(COURTS, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.usage.total.inputTokens; totalOut += r.usage.total.outputTokens; }
const totalCost = (totalIn / 1e6) * 2.5 + (totalOut / 1e6) * 15;

// Compare with worktree reference
let matchCount = 0;
console.log(`\n${"═".repeat(100)}`);
console.log(`RESULTS — ${results.filter(r => r.success).length}/${results.length} pass | ${batchTime}s | $${totalCost.toFixed(4)}`);
console.log("═".repeat(100));

console.log("\n| Court | Our date | Source | Worktree ref | Match? | Cost | Time |");
console.log("|-------|----------|--------|-------------|--------|------|------|");

for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const date = r.result?.publicationDate || "FAIL";
  const source = r.result?.publicationDateSource || "—";
  const ref = worktreeRef[r.court] || "?";
  const match = date === ref ? "✓" : "✗";
  if (date === ref) matchCount++;
  const cost = ((r.usage.total.inputTokens / 1e6) * 2.5 + (r.usage.total.outputTokens / 1e6) * 15).toFixed(4);
  const time = (r.timing.totalMs / 1000).toFixed(0) + "s";
  console.log(`| ${r.court} | ${date} | ${source} | ${ref} | ${match} | $${cost} | ${time} |`);
}

console.log(`\nAgreement with worktree: ${matchCount}/${results.length}`);
console.log(`Total: $${totalCost.toFixed(4)} | ${batchTime}s`);
console.log(`Average: $${(totalCost / results.length).toFixed(4)}/court | ${(parseFloat(batchTime) / results.length).toFixed(1)}s/court`);

// Detailed results for divergent courts
const divergent = results.filter(r => r.result?.publicationDate !== worktreeRef[r.court]);
if (divergent.length > 0) {
  console.log(`\n--- Divergent courts ---`);
  for (const r of divergent) {
    console.log(`\n${r.court}:`);
    console.log(`  Our: ${r.result?.publicationDate} (${r.result?.publicationDateSource})`);
    console.log(`  Ref: ${worktreeRef[r.court]}`);
    console.log(`  Explanation: ${r.result?.dateExtractionExplanation?.slice(0, 300)}`);
    if (r.result?.errors?.length) console.log(`  Errors: ${r.result.errors.join("; ")}`);
  }
}

// Save
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const path = `docs/archive/gpt54-lowlow-${timestamp}.json`;
await Bun.write(path, JSON.stringify({ results, batchTime, totalCost, matchCount, worktreeRef }, null, 2));
console.log(`\nSaved: ${path}`);
