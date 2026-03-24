import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";
import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";
import type { CourtSearchResult, TokenUsage } from "../lib/run-court-search.ts";

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

// GPT-5.4 full — same setup as Mini but bigger model
const gpt54Agent = new Agent({
  id: "expert-search-gpt54",
  name: "Expert Search (GPT-5.4)",
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
  model: openai("gpt-5.4"),
  tools: {
    webSearch: openai.tools.webSearch({
      userLocation: { type: "approximate", city: "Paris", region: "Île-de-France" },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});

async function runGPT54(court: string): Promise<CourtSearchResult> {
  const totalStart = Date.now();
  try {
    const agentStart = Date.now();
    const agentResult = await gpt54Agent.generate(
      `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      { maxSteps: 15 }
    );
    const agentMs = Date.now() - agentStart;
    const agentUsage: TokenUsage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
      totalTokens: agentResult.usage?.totalTokens ?? 0,
    };

    const extractionStart = Date.now();
    const extractResult = await generateText({
      model: openai("gpt-5.4"),
      output: Output.object({ schema: expertFinderResultSchema }),
      prompt: `Extract structured data from these French court expert search findings.

## Court: ${court}

## Agent's findings:
${agentResult.text.slice(0, 3000)}

The date inside the PDF is the AUTHORITATIVE source (publicationDateSource: "pdf-content").
Date format: YYYY-MM-DD. Convert French dates (DD/MM/YYYY → YYYY-MM-DD).`,
    });
    const extractionMs = Date.now() - extractionStart;
    const extractionUsage: TokenUsage = {
      inputTokens: extractResult.usage?.inputTokens ?? 0,
      outputTokens: extractResult.usage?.outputTokens ?? 0,
      totalTokens: extractResult.usage?.totalTokens ?? 0,
    };

    const parsed = expertFinderResultSchema.parse(extractResult.output);
    return {
      court, success: true, result: parsed,
      timing: { agentMs, extractionMs, totalMs: Date.now() - totalStart },
      usage: {
        agent: agentUsage, extraction: extractionUsage,
        total: {
          inputTokens: agentUsage.inputTokens + extractionUsage.inputTokens,
          outputTokens: agentUsage.outputTokens + extractionUsage.outputTokens,
          totalTokens: agentUsage.totalTokens + extractionUsage.totalTokens,
        },
      },
      error: null, agentText: agentResult.text.slice(0, 500),
    };
  } catch (error) {
    return {
      court, success: false, result: null,
      timing: { agentMs: 0, extractionMs: 0, totalMs: Date.now() - totalStart },
      usage: { agent: emptyUsage(), extraction: emptyUsage(), total: emptyUsage() },
      error: error instanceof Error ? error.message : "Unknown error", agentText: "",
    };
  }
}

// Same 5 divergent courts to compare all 3 models
const COURTS = ["Lyon", "Bordeaux", "Amiens", "Angers", "Besançon"];
const CONCURRENCY = 5;

async function runBatch(courts: string[], concurrency: number): Promise<CourtSearchResult[]> {
  const results: CourtSearchResult[] = [];
  const queue = [...courts];
  async function worker(id: number) {
    while (queue.length > 0) {
      const court = queue.shift()!;
      console.log(`[W${id}] Starting: ${court}`);
      const result = await runGPT54(court);
      if (result.success) {
        const cost = ((result.usage.total.inputTokens / 1e6) * 2.5 + (result.usage.total.outputTokens / 1e6) * 15).toFixed(4);
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

console.log(`\nGPT-5.4 Full — 5 divergent courts\n${"=".repeat(60)}\n`);
const start = Date.now();
const results = await runBatch(COURTS, CONCURRENCY);
const batchTime = ((Date.now() - start) / 1000).toFixed(1);

let totalIn = 0, totalOut = 0;
for (const r of results) { totalIn += r.usage.total.inputTokens; totalOut += r.usage.total.outputTokens; }
const totalCost = (totalIn / 1e6) * 2.5 + (totalOut / 1e6) * 15;

console.log(`\n${"=".repeat(60)}`);
console.log(`Done: ${results.filter(r => r.success).length}/${results.length} pass | ${batchTime}s | $${totalCost.toFixed(4)}\n`);

// 3-model comparison table
const sonnetDates: Record<string, string> = {
  "Lyon": "2026-01-15", "Bordeaux": "2025-07-01", "Amiens": "2026-02-01",
  "Angers": "2026-03-20", "Besançon": "2024-01-01",
};
const miniDates: Record<string, string> = {
  "Lyon": "2025-11-21", "Bordeaux": "2025-01-01", "Amiens": "2022-12-05",
  "Angers": "2025-11-18", "Besançon": "2013-03-20",
};

console.log("| Court | Sonnet 4.6 | Mini (none) | GPT-5.4 | Source |");
console.log("|-------|-----------|-------------|---------|--------|");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  const gptDate = r.result?.publicationDate || "FAIL";
  const source = r.result?.publicationDateSource || "—";
  console.log(`| ${r.court} | ${sonnetDates[r.court]} | ${miniDates[r.court]} | ${gptDate} | ${source} |`);
}

console.log("\n--- Detailed results ---");
for (const r of results.sort((a, b) => a.court.localeCompare(b.court))) {
  console.log(`\n${r.court}:`);
  if (r.result) console.log(JSON.stringify(r.result, null, 2));
  else console.log(`Error: ${r.error}`);
}

const path = `docs/archive/gpt54-full-divergent-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await Bun.write(path, JSON.stringify({ model: "gpt-5.4", results, batchTime, totalCost }, null, 2));
console.log(`\nSaved: ${path}`);
