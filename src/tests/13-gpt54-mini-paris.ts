import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";
import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";

// GPT-5.4 Mini agent with OpenAI web search + our custom tools
const miniAgent = new Agent({
  id: "expert-search-mini",
  name: "Expert Search (GPT-5.4 Mini)",
  instructions: `You are an expert at finding official French court "experts judiciaires" directory pages, PDF documents, and their publication dates.

Given a French Cour d'appel name:
1. Web search for "[city] cour d'appel experts judiciaires liste site:justice.fr"
2. Prioritize .justice.fr URLs. IGNORE exjudis.fr, cncej.org.
3. Use fetchPage on the .justice.fr URL to get PDF links.
4. Pick the most recent expert directory PDF (tagged "likely-expert-list").
5. Use extractPdfDate to read the PDF. The date inside is the AUTHORITATIVE source.
6. Look for: "MAJ LE 10/03/2026", "Liste arrêtée au...", "Mise à jour..."
7. Return: court name, page URL, PDF URL, publication date (YYYY-MM-DD), and where you found the date.

Legacy fallback: if cours-appel.justice.fr/[city] fails, try ca-[city].justice.fr (HTTP not HTTPS).`,
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

const court = process.argv[2] || "Paris";
console.log(`GPT-5.4 Mini: Cour d'appel de ${court}\n`);

// Step 1: Agent gathers data
console.log("Step 1: Agent searching...");
const agentStart = Date.now();

const agentResult = await miniAgent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
  { maxSteps: 15 }
);

const agentMs = Date.now() - agentStart;
const agentUsage = agentResult.usage;
console.log(`  Done in ${(agentMs / 1000).toFixed(1)}s`);
console.log(`  Tokens: ${agentUsage?.inputTokens ?? "?"} in / ${agentUsage?.outputTokens ?? "?"} out`);

// Step 2: Extraction with GPT-5.4 Mini + structured output
console.log("\nStep 2: Extracting structured data...");
const extractStart = Date.now();

const extractResult = await generateText({
  model: openai("gpt-5.4-mini"),
  output: Output.object({ schema: expertFinderResultSchema }),
  prompt: `Extract structured data from these French court expert search findings.

## Court: ${court}

## Agent's findings:
${agentResult.text.slice(0, 3000)}

The date inside the PDF is the AUTHORITATIVE source (publicationDateSource: "pdf-content").
Date format: YYYY-MM-DD. Convert French dates (DD/MM/YYYY → YYYY-MM-DD).`,
});

const extractMs = Date.now() - extractStart;
const extractUsage = extractResult.usage;
console.log(`  Done in ${(extractMs / 1000).toFixed(1)}s`);
console.log(`  Tokens: ${extractUsage?.inputTokens ?? "?"} in / ${extractUsage?.outputTokens ?? "?"} out`);

// Results
const totalMs = Date.now() - agentStart;
const totalInput = (agentUsage?.inputTokens ?? 0) + (extractUsage?.inputTokens ?? 0);
const totalOutput = (agentUsage?.outputTokens ?? 0) + (extractUsage?.outputTokens ?? 0);
const inputCost = (totalInput / 1_000_000) * 0.75;
const outputCost = (totalOutput / 1_000_000) * 4.50;

console.log(`\n--- Summary ---`);
console.log(`Total: ${(totalMs / 1000).toFixed(1)}s`);
console.log(`Tokens: ${totalInput} in / ${totalOutput} out`);
console.log(`Cost: $${(inputCost + outputCost).toFixed(4)}`);
console.log(`\nResult:`);
console.log(JSON.stringify(extractResult.output, null, 2));
