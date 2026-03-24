import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const court = process.argv[2] || "Paris";
console.log(`Clean extraction: Cour d'appel de ${court}\n`);

// Step 1: Agent gathers raw data
console.log("Step 1: Agent searching + fetching + reading PDF...");
const start = Date.now();

const agent = mastra.getAgent("expert-search-agent");
const agentResult = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate. Donne-moi: l'URL de la page, l'URL du PDF, le nom du fichier, le texte de la page (date hints), et le texte du PDF (premières pages).`,
  { maxSteps: 15 }
);

const agentTime = ((Date.now() - start) / 1000).toFixed(1);
console.log(`  Done in ${agentTime}s\n`);

// Step 2: Extract raw data from tool results
const toolResults: Record<string, any> = {};
for (const step of agentResult.steps || []) {
  for (const tr of step.toolResults || []) {
    if (tr.toolName === "fetchPage" && tr.result?.success) {
      toolResults.fetchPage = tr.result;
    }
    if (tr.toolName === "extractPdfDate" && tr.result?.success) {
      toolResults.extractPdfDate = tr.result;
    }
  }
}

const pageText = toolResults.fetchPage?.pageText?.slice(0, 2000) || "Page text not available";
const pdfLinks = toolResults.fetchPage?.pdfLinks
  ?.filter((p: any) => p.relevanceHint === "likely-expert-list")
  ?.map((p: any) => `- "${p.text}" → ${p.url}`)
  ?.join("\n") || "No PDF links found";
const pdfText = toolResults.extractPdfDate?.pdfText?.slice(0, 1000) || "PDF text not available";
const agentSummary = agentResult.text.slice(0, 1500);

console.log("Step 2: Data collected:");
console.log(`  Page text: ${pageText.length} chars`);
console.log(`  PDF links:\n${pdfLinks}`);
console.log(`  PDF text: ${pdfText.length} chars`);
console.log(`  Agent summary: ${agentSummary.length} chars\n`);

// Step 3: Clean Sonnet 4.6 extraction call
console.log("Step 3: Sonnet 4.6 structured extraction...");
const extractStart = Date.now();

const { output } = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  output: Output.object({
    schema: expertFinderResultSchema,
  }),
  providerOptions: {
    anthropic: {
      thinking: { type: "adaptive" },
      effort: "low",
    },
  },
  prompt: `You are extracting structured data from French court expert directory search results.

## Court: ${court} (Cour d'appel de ${court})

## Agent's summary:
${agentSummary}

## PDF links found on the page:
${pdfLinks}

## Page text (first 2000 chars):
${pageText}

## PDF content (first 1000 chars):
${pdfText}

Extract the publication date. The date inside the PDF is the AUTHORITATIVE source.
Common patterns: "MAJ LE 10/03/2026" → 2026-03-10, "Liste arrêtée au 14 janvier 2025" → 2025-01-14.
Date format: YYYY-MM-DD. Convert French dates (DD/MM/YYYY → YYYY-MM-DD).`,
});

const extractTime = ((Date.now() - extractStart) / 1000).toFixed(1);
const totalTime = ((Date.now() - start) / 1000).toFixed(1);

console.log(`  Done in ${extractTime}s\n`);
console.log(`Total: ${totalTime}s (agent: ${agentTime}s + extraction: ${extractTime}s)\n`);
console.log(JSON.stringify(output, null, 2));
