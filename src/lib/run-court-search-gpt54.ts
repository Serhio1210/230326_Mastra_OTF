/**
 * GPT-5.4 full with allowed_domains + low/low effort.
 * Matches the worktree's best config (9/10 agreement).
 */
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

const ALLOWED_DOMAINS = [
  "cours-appel.justice.fr",
  "courdecassation.fr",
  "ca-papeete.justice.fr",
  "ca-besancon.justice.fr",
  "ca-noumea.justice.fr",
  "ca-cayenne.justice.fr",
  "ca-bastia.justice.fr",
];

const gpt54Agent = new Agent({
  id: "expert-search-gpt54-full",
  name: "Expert Search (GPT-5.4 Full)",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: openai("gpt-5.4"),
  tools: {
    webSearch: openai.tools.webSearch({
      userLocation: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
      },
      filters: {
        allowedDomains: ALLOWED_DOMAINS,
      },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});

export async function runCourtSearchGPT54(court: string): Promise<CourtSearchResult> {
  const totalStart = Date.now();

  try {
    const agentStart = Date.now();

    const agentResult = await gpt54Agent.generate(
      `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      {
        maxSteps: 15,
        providerOptions: {
          openai: { reasoningEffort: "low" },
        },
      }
    );

    const agentMs = Date.now() - agentStart;

    const agentUsage: TokenUsage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
      totalTokens: agentResult.usage?.totalTokens ?? 0,
    };

    // Collect raw tool data from payload.result
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

    // Extraction with low effort
    const extractionStart = Date.now();

    const extractResult = await generateText({
      model: openai("gpt-5.4"),
      output: Output.object({ schema: expertFinderResultSchema }),
      providerOptions: {
        openai: { reasoningEffort: "low" },
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
