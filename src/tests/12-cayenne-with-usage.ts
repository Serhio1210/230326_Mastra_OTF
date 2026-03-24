import { runCourtSearch } from "../lib/run-court-search.ts";

console.log("Cayenne — with token usage tracking\n");

const result = await runCourtSearch("Cayenne");

if (result.success && result.result) {
  console.log(`✓ ${result.result.publicationDate} (${result.result.publicationDateSource})`);
  console.log(JSON.stringify(result.result, null, 2));
} else {
  console.log(`✗ FAILED: ${result.error}`);
}

console.log("\n--- Usage ---");
console.log(`Agent:      ${result.usage.agent.inputTokens} in / ${result.usage.agent.outputTokens} out / ${result.usage.agent.totalTokens} total`);
console.log(`Extraction: ${result.usage.extraction.inputTokens} in / ${result.usage.extraction.outputTokens} out / ${result.usage.extraction.totalTokens} total`);
console.log(`TOTAL:      ${result.usage.total.inputTokens} in / ${result.usage.total.outputTokens} out / ${result.usage.total.totalTokens} total`);
console.log(`\nTiming: agent ${(result.timing.agentMs / 1000).toFixed(1)}s + extraction ${(result.timing.extractionMs / 1000).toFixed(1)}s = ${(result.timing.totalMs / 1000).toFixed(1)}s`);

// Cost estimate (Sonnet 4.6: $3/1M input, $15/1M output)
const inputCost = (result.usage.total.inputTokens / 1_000_000) * 3;
const outputCost = (result.usage.total.outputTokens / 1_000_000) * 15;
console.log(`\nEstimated cost: $${(inputCost + outputCost).toFixed(4)} (input: $${inputCost.toFixed(4)}, output: $${outputCost.toFixed(4)})`);
