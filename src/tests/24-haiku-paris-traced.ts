/**
 * Test 24: Haiku 4.5 with domain filtering — Paris
 *
 * Agent: claude-haiku-4-5, effort: low
 * Web search: webSearch_20260209 with allowedDomains: [justice.fr, gouv.fr]
 * Extraction: claude-haiku-4-5, effort: medium, native structured output
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { tracedCourtSearch, printTrace } from "../lib/trace-court-search.ts";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const court = process.argv[2] || "Paris";

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Haiku 4.5 + Domain Filtering                       ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Court: ${court}`);
console.log(`  Agent: claude-haiku-4-5 (default, no effort param)`);
console.log(`  Search: webSearch_20260209 + allowedDomains: [justice.fr, gouv.fr]`);
console.log(`  Extraction: claude-haiku-4-5 (thinking: 5000 tokens)`);
console.log(`  Started: ${new Date().toISOString()}\n`);

// Step 1: Agent with traced search
const agentStart = Date.now();
const agent = mastra.getAgent("expert-search-haiku");

const agentResult = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
  {
    maxSteps: 15,
    onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
      const turn = toolCalls?.length ? `tools: ${toolCalls.length}` : "text";
      console.log(`  [Step] ${turn} | tokens: ${usage?.inputTokens ?? "?"}in/${usage?.outputTokens ?? "?"}out | reason: ${finishReason}`);
    },
  }
);

const agentMs = Date.now() - agentStart;

// Collect raw data from payload.result
let pageText = "", pageTitle = "", pdfText = "";
let pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];

for (const step of agentResult.steps || []) {
  for (const tr of step.toolResults || []) {
    const p = (tr as any).payload;
    if (!p) continue;
    if (p.toolName === "fetchPage" && p.result?.success) {
      pageText = p.result.pageText || "";
      pageTitle = p.result.title || "";
      pdfLinks = p.result.pdfLinks || [];
    }
    if (p.toolName === "extractPdfDate" && p.result?.success) {
      pdfText = p.result.pdfText || "";
    }
  }
}

console.log(`\n  Agent done in ${(agentMs / 1000).toFixed(1)}s`);
console.log(`  Agent tokens: ${agentResult.usage?.inputTokens ?? "?"}in / ${agentResult.usage?.outputTokens ?? "?"}out`);
console.log(`  Raw data: page=${pageText.length} chars, PDFs=${pdfLinks.length}, PDF text=${pdfText.length} chars`);

// Step 2: Extraction with Haiku + medium effort
console.log(`\n  Extracting with Haiku (effort: medium)...`);
const extractStart = Date.now();

const extractResult = await generateText({
  model: anthropic("claude-haiku-4-5"),
  output: Output.object({ schema: expertFinderResultSchema }),
  providerOptions: {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 5000 },
    },
  },
  prompt: `You are analyzing date signals from a French court expert directory search.

## Court: ${court}

## Agent summary:
${agentResult.text.slice(0, 2000)}

## Page title:
${pageTitle || "not available"}

## Page text (first 2000 chars):
${pageText.slice(0, 2000) || "not available"}

## PDF links found on the page:
${pdfLinks.length > 0 ? pdfLinks.map(p => `- [${p.relevanceHint}] "${p.text}" → ${p.url}`).join("\n") : "none"}

## PDF content (first 1500 chars):
${pdfText.slice(0, 1500) || "not available"}

Determine the publication date. Check ALL sources:
1. Exact date in PDF text
2. Exact date in page text
3. Date in PDF link anchor text
4. Date in the PDF URL path
5. Year only as last resort

Use the most specific and most recent date. A year-only date must not override an exact date.
Date format: YYYY-MM-DD.`,
});

const extractMs = Date.now() - extractStart;
const totalMs = Date.now() - agentStart;

// Results
console.log(`  Extraction done in ${(extractMs / 1000).toFixed(1)}s`);
console.log(`  Extraction tokens: ${extractResult.usage?.inputTokens ?? "?"}in / ${extractResult.usage?.outputTokens ?? "?"}out`);

const totalInput = (agentResult.usage?.inputTokens ?? 0) + (extractResult.usage?.inputTokens ?? 0);
const totalOutput = (agentResult.usage?.outputTokens ?? 0) + (extractResult.usage?.outputTokens ?? 0);
// Haiku 4.5: $1/1M input, $5/1M output
const cost = (totalInput / 1e6) * 1.0 + (totalOutput / 1e6) * 5.0;

console.log(`\n${"═".repeat(60)}`);
console.log(`RESULT`);
console.log("═".repeat(60));
console.log(JSON.stringify(extractResult.output, null, 2));
console.log(`\n  Total: ${(totalMs / 1000).toFixed(1)}s | Tokens: ${totalInput}in/${totalOutput}out | Cost: $${cost.toFixed(4)}`);
