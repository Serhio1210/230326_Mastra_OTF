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
      userLocation: { type: "approximate", city: "Paris", region: "Île-de-France" },
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

    const extractionStart = Date.now();

    const extractResult = await generateText({
      model: openai("gpt-5.4-mini"),
      output: Output.object({ schema: expertFinderResultSchema }),
      providerOptions: {
        openai: { reasoningEffort: "medium" },
      },
      prompt: `Extract structured data from these French court expert search findings.

## Court: ${court}

## Agent's findings:
${agentResult.text.slice(0, 3000)}

Pick the most specific and most recent date available from any source.
An exact date from page text or filename overrides a year-only mention from the PDF.
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
