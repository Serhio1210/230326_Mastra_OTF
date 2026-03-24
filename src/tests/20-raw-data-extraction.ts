import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";
import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "../mastra/agents/instructions.ts";

const miniAgent = new Agent({
  id: "expert-search-mini-raw",
  name: "Expert Search Mini (raw data test)",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: openai("gpt-5.4-mini"),
  tools: {
    webSearch: openai.tools.webSearch({
      userLocation: { type: "approximate", city: "Paris", region: "Île-de-France" },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});

const court = process.argv[2] || "Bordeaux";
console.log(`Raw data extraction test: ${court}\n`);

// Step 1: Agent gathers data
const agentResult = await miniAgent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate.`,
  {
    maxSteps: 15,
    onStepFinish: ({ toolResults }) => {
      if (!toolResults) return;
      for (const tr of toolResults) {
        console.log(`  [step] tool: ${tr.toolName}, result keys: ${Object.keys(tr.result || {}).join(", ")}`);
        if (tr.toolName === "fetchPage" && tr.result?.pageText) {
          console.log(`  [step] fetchPage pageText length: ${tr.result.pageText.length}`);
          console.log(`  [step] fetchPage pdfLinks count: ${tr.result.pdfLinks?.length}`);
        }
        if (tr.toolName === "extractPdfDate" && tr.result?.pdfText) {
          console.log(`  [step] extractPdfDate pdfText length: ${tr.result.pdfText.length}`);
        }
      }
    },
  }
);

// Collect raw data from steps
let pageText = "";
let pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];
let pdfText = "";
let pageTitle = "";

for (const step of agentResult.steps || []) {
  for (const tr of step.toolResults || []) {
    if (tr.toolName === "fetchPage" && tr.result?.success) {
      pageText = tr.result.pageText || "";
      pdfLinks = tr.result.pdfLinks || [];
      pageTitle = tr.result.title || "";
    }
    if (tr.toolName === "extractPdfDate" && tr.result?.success) {
      pdfText = tr.result.pdfText || "";
    }
  }
}

console.log(`\n--- Raw data collected ---`);
console.log(`Page title: ${pageTitle}`);
console.log(`Page text: ${pageText.length} chars`);
console.log(`PDF links: ${pdfLinks.length}`);
for (const p of pdfLinks) {
  console.log(`  [${p.relevanceHint}] "${p.text.slice(0, 60)}" → ${p.url}`);
}
console.log(`PDF text: ${pdfText.length} chars`);
console.log(`Agent summary: ${agentResult.text.length} chars`);

// Step 2: Extraction with ALL raw signals + medium reasoning
console.log(`\n--- Extraction with raw data + medium reasoning ---`);

const extractResult = await generateText({
  model: openai("gpt-5.4-mini"),
  output: Output.object({ schema: expertFinderResultSchema }),
  providerOptions: {
    openai: { reasoningEffort: "medium" },
  },
  prompt: `You are analyzing date signals from a French court expert directory search.

## Court: ${court}

## Agent summary:
${agentResult.text.slice(0, 2000)}

## Page title:
${pageTitle}

## Page text (date hints):
${pageText.slice(0, 2000)}

## PDF links found on the page:
${pdfLinks.map(p => `- [${p.relevanceHint}] "${p.text}" → ${p.url}`).join("\n") || "none"}

## PDF content (first pages):
${pdfText.slice(0, 1500)}

Determine the publication date. Check ALL sources:
1. Exact date in PDF text (e.g. "MAJ LE 10/03/2026", "assemblée du 18 novembre 2025")
2. Exact date in page text (e.g. "mise à jour : 24/02/2026")
3. Date in PDF link text
4. Date in the PDF URL path (e.g. "/2025-07/" means July 2025)
5. Year only as last resort

Use the most specific and most recent date. A year-only date must not override an exact date from any source.
Date format: YYYY-MM-DD.`,
});

console.log(`\nResult:`);
console.log(JSON.stringify(extractResult.output, null, 2));
console.log(`\nExtraction tokens: ${extractResult.usage?.inputTokens} in / ${extractResult.usage?.outputTokens} out`);
