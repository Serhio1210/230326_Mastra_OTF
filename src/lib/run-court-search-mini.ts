import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { expertFinderResultSchema, type ExpertFinderResult } from "../mastra/schemas/expert-finder.ts";
import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "../mastra/agents/instructions.ts";
import type { CourtSearchResult, TokenUsage } from "./run-court-search.ts";

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

const miniAgent = new Agent({
  id: "expert-search-mini",
  name: "Expert Search (GPT-5.4 Mini)",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: openai("gpt-5.4-mini"),
  tools: {
    webSearch: openai.tools.webSearch({
      userLocation: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
      },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});

export type MiniEffort = "none" | "low" | "medium" | "high";

export async function runCourtSearchMini(court: string, effort: MiniEffort = "none"): Promise<CourtSearchResult> {
  const totalStart = Date.now();

  try {
    const agentStart = Date.now();

    const agentResult = await miniAgent.generate(
      `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      {
        maxSteps: 15,
        providerOptions: effort !== "none" ? { openai: { reasoningEffort: effort } } : undefined,
      }
    );

    const agentMs = Date.now() - agentStart;

    const agentUsage: TokenUsage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
      totalTokens: agentResult.usage?.totalTokens ?? 0,
    };

    // Collect raw tool results from agent steps (data is in payload.result)
    let pageText = "";
    let pageTitle = "";
    let pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];
    let pdfText = "";

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

    // Build extraction prompt with ALL raw signals
    const extractionStart = Date.now();

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
${pageTitle || "not available"}

## Page text (first 2000 chars):
${pageText.slice(0, 2000) || "not available"}

## PDF links found on the page:
${pdfLinks.length > 0 ? pdfLinks.map(p => `- [${p.relevanceHint}] "${p.text}" → ${p.url}`).join("\n") : "none"}

## PDF content (first 1500 chars):
${pdfText.slice(0, 1500) || "not available"}

Determine the publication date. Check ALL sources:
1. Exact date in PDF text (e.g. "MAJ LE 10/03/2026", "assemblée du 18 novembre 2025")
2. Exact date in page text (e.g. "mise à jour : 24/02/2026")
3. Date in PDF link anchor text
4. Date in the PDF URL path (e.g. "/2025-07/" means July 2025, "/2026-03/" means March 2026)
5. Year only as last resort

Use the most specific and most recent date. A year-only date must not override an exact date.
Date format: YYYY-MM-DD.`,
    });

    const extractionMs = Date.now() - extractionStart;

    const extractionUsage: TokenUsage = {
      inputTokens: extractResult.usage?.inputTokens ?? 0,
      outputTokens: extractResult.usage?.outputTokens ?? 0,
      totalTokens: extractResult.usage?.totalTokens ?? 0,
    };

    const parsed = expertFinderResultSchema.parse(extractResult.output);

    return {
      court,
      success: true,
      result: parsed,
      timing: { agentMs, extractionMs, totalMs: Date.now() - totalStart },
      usage: {
        agent: agentUsage,
        extraction: extractionUsage,
        total: {
          inputTokens: agentUsage.inputTokens + extractionUsage.inputTokens,
          outputTokens: agentUsage.outputTokens + extractionUsage.outputTokens,
          totalTokens: agentUsage.totalTokens + extractionUsage.totalTokens,
        },
      },
      error: null,
      agentText: agentResult.text.slice(0, 500),
    };
  } catch (error) {
    return {
      court,
      success: false,
      result: null,
      timing: { agentMs: 0, extractionMs: 0, totalMs: Date.now() - totalStart },
      usage: { agent: emptyUsage(), extraction: emptyUsage(), total: emptyUsage() },
      error: error instanceof Error ? error.message : "Unknown error",
      agentText: "",
    };
  }
}
