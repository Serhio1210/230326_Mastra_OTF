import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema, type ExpertFinderResult } from "../mastra/schemas/expert-finder.ts";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CourtSearchResult = {
  court: string;
  success: boolean;
  result: ExpertFinderResult | null;
  timing: {
    agentMs: number;
    extractionMs: number;
    totalMs: number;
  };
  usage: {
    agent: TokenUsage;
    extraction: TokenUsage;
    total: TokenUsage;
  };
  error: string | null;
  agentText: string;
};

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export async function runCourtSearch(court: string): Promise<CourtSearchResult> {
  const totalStart = Date.now();

  try {
    // Step 1: Agent gathers raw data
    const agent = mastra.getAgent("expert-search-agent");
    const agentStart = Date.now();

    const agentResult = await agent.generate(
      `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      { maxSteps: 15 }
    );

    const agentMs = Date.now() - agentStart;
    const agentText = agentResult.text;

    const agentUsage: TokenUsage = {
      inputTokens: agentResult.usage?.inputTokens ?? 0,
      outputTokens: agentResult.usage?.outputTokens ?? 0,
      totalTokens: agentResult.usage?.totalTokens ?? 0,
    };

    // Step 2: Clean Sonnet 4.6 extraction with native structured output
    const extractionStart = Date.now();
    const agentSummary = agentText.slice(0, 3000);

    const extractionResult = await generateText({
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

## Agent's findings:
${agentSummary}

Extract the structured data from the agent's findings above.
The date inside the PDF is the AUTHORITATIVE source (publicationDateSource: "pdf-content").
If the agent could not read the PDF, use the best date available from the page text, link text, or filename.
Common date patterns: "MAJ LE 10/03/2026" → 2026-03-10, "mise à jour : 24/02/2026" → 2026-02-24.
Date format: YYYY-MM-DD. Convert French dates (DD/MM/YYYY → YYYY-MM-DD).`,
    });

    const extractionMs = Date.now() - extractionStart;

    const extractionUsage: TokenUsage = {
      inputTokens: extractionResult.usage?.inputTokens ?? 0,
      outputTokens: extractionResult.usage?.outputTokens ?? 0,
      totalTokens: extractionResult.usage?.totalTokens ?? 0,
    };

    const parsed = expertFinderResultSchema.parse(extractionResult.output);

    return {
      court,
      success: true,
      result: parsed,
      timing: {
        agentMs,
        extractionMs,
        totalMs: Date.now() - totalStart,
      },
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
      agentText: agentText.slice(0, 500),
    };
  } catch (error) {
    return {
      court,
      success: false,
      result: null,
      timing: {
        agentMs: 0,
        extractionMs: 0,
        totalMs: Date.now() - totalStart,
      },
      usage: {
        agent: emptyUsage(),
        extraction: emptyUsage(),
        total: emptyUsage(),
      },
      error: error instanceof Error ? error.message : "Unknown error",
      agentText: "",
    };
  }
}
