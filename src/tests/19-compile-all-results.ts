import { readdir } from "node:fs/promises";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

// Load reference data
const referenceRaw = await Bun.file("docs/reference-data/courts-verified.json").text();
const reference: Array<{ court: string; publishedOld: string; pdfUrlOld: string }> = JSON.parse(referenceRaw);
const refMap = new Map(reference.map(r => [r.court, r]));

// Load all mini batch results
const archiveDir = "docs/archive";
const files = (await readdir(archiveDir)).filter(f => f.startsWith("mini-batch") && f.endsWith(".json"));

const allResults: CourtSearchResult[] = [];
for (const file of files.sort()) {
  const data = JSON.parse(await Bun.file(`${archiveDir}/${file}`).text());
  allResults.push(...(data.results || []));
}

// Load Sonnet batch results
const sonnetFiles = (await readdir(archiveDir)).filter(f => f.startsWith("batch") && !f.startsWith("batch-") && f.endsWith(".json"));
const sonnetResults: CourtSearchResult[] = [];
for (const file of sonnetFiles.sort()) {
  const data = JSON.parse(await Bun.file(`${archiveDir}/${file}`).text());
  sonnetResults.push(...(data.results || []));
}
// Also load the first batch (batch-results-*)
const batch0Files = (await readdir(archiveDir)).filter(f => f.startsWith("batch-results-") && f.endsWith(".json"));
for (const file of batch0Files) {
  const data = JSON.parse(await Bun.file(`${archiveDir}/${file}`).text());
  if (Array.isArray(data)) {
    sonnetResults.push(...data);
  }
}
const sonnetMap = new Map(sonnetResults.map(r => [r.court, r]));

// Compile readable report
const lines: string[] = [];
lines.push("# All 36 Courts — Complete Results Comparison");
lines.push(`\n**Generated**: ${new Date().toISOString()}`);
lines.push(`**Mini model**: GPT-5.4 Mini (effort: none)`);
lines.push(`**Sonnet model**: Claude Sonnet 4.6 (effort: low)`);
lines.push("");

// Summary table
lines.push("## Summary Table");
lines.push("");
lines.push("| # | Court | Mini Date | Mini Source | Sonnet Date | Sonnet Source | Ref Date | Page URL | PDF URL | Mini Tokens | Mini Cost |");
lines.push("|---|-------|-----------|------------|-------------|-------------|----------|----------|---------|-------------|-----------|");

let totalTokens = 0;
let totalCost = 0;

const sorted = [...allResults].sort((a, b) => a.court.localeCompare(b.court));

for (const [i, r] of sorted.entries()) {
  const ref = refMap.get(r.court);
  const son = sonnetMap.get(r.court);

  const miniDate = r.result?.publicationDate || "null";
  const miniSource = r.result?.publicationDateSource || "—";
  const sonnetDate = son?.result?.publicationDate || "?";
  const sonnetSource = son?.result?.publicationDateSource || "?";
  const refDate = ref?.publishedOld || "?";

  const pageUrl = r.result?.pageUrl || "—";
  const pdfUrl = r.result?.documentUrl || "—";

  const tokens = r.usage?.total?.totalTokens || 0;
  const cost = ((r.usage?.total?.inputTokens || 0) / 1e6) * 0.75 + ((r.usage?.total?.outputTokens || 0) / 1e6) * 4.5;
  totalTokens += tokens;
  totalCost += cost;

  // Truncate URLs for readability
  const shortPage = pageUrl.length > 60 ? pageUrl.slice(0, 57) + "..." : pageUrl;
  const shortPdf = pdfUrl.length > 60 ? pdfUrl.slice(0, 57) + "..." : pdfUrl;

  lines.push(`| ${i + 1} | ${r.court} | ${miniDate} | ${miniSource} | ${sonnetDate} | ${sonnetSource} | ${refDate} | ${shortPage} | ${shortPdf} | ${tokens} | $${cost.toFixed(4)} |`);
}

lines.push("");
lines.push(`**Total tokens**: ${totalTokens} | **Total cost**: $${totalCost.toFixed(4)}`);

// Detailed per-court section
lines.push("\n---\n");
lines.push("## Detailed Results Per Court\n");

for (const r of sorted) {
  const ref = refMap.get(r.court);
  const son = sonnetMap.get(r.court);

  lines.push(`### ${r.court}`);
  lines.push("");

  if (r.result) {
    lines.push(`- **Page URL**: ${r.result.pageUrl || "not found"}`);
    lines.push(`- **PDF URL**: ${r.result.documentUrl || "not found"}`);
    lines.push(`- **PDF Title**: ${r.result.documentTitle || "—"}`);
    lines.push(`- **Mini Date**: ${r.result.publicationDate || "null"} (${r.result.publicationDateSource})`);
    lines.push(`- **Sonnet Date**: ${son?.result?.publicationDate || "?"} (${son?.result?.publicationDateSource || "?"})`);
    lines.push(`- **Reference Date**: ${ref?.publishedOld || "?"}`);
    lines.push(`- **Reference PDF**: ${ref?.pdfUrlOld || "?"}`);
    lines.push(`- **Search explanation**: ${r.result.searchExplanation}`);
    lines.push(`- **Date explanation**: ${r.result.dateExtractionExplanation}`);
    if (r.result.errors.length > 0) {
      lines.push(`- **Errors**: ${r.result.errors.join("; ")}`);
    }
  } else {
    lines.push(`- **FAILED**: ${r.error}`);
  }

  lines.push(`- **Tokens**: ${r.usage?.total?.inputTokens || 0} in / ${r.usage?.total?.outputTokens || 0} out`);
  lines.push(`- **Time**: ${((r.timing?.totalMs || 0) / 1000).toFixed(1)}s`);
  lines.push("");
}

const output = lines.join("\n");
const outputPath = "docs/archive/20260324_all_results_comparison.md";
await Bun.write(outputPath, output);
console.log(`Written to ${outputPath}`);
console.log(`${sorted.length} courts, ${totalTokens} tokens, $${totalCost.toFixed(4)}`);
