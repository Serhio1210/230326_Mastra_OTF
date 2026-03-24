/**
 * Traced court search — captures every step, tool call, and decision.
 * Works with both Mastra agents (Sonnet, Mini) via mastra.getAgent().
 * Produces the same trace format as the native OpenAI SDK version.
 */
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema, type ExpertFinderResult } from "../mastra/schemas/expert-finder.ts";

// ── Trace types ─────────────────────────────────────────────────────

export type StepUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ToolEvent = {
  type: "tool_call" | "tool_result" | "web_search" | "model_text";
  toolName?: string;
  input?: any;
  compactOutput?: string;
  fullResult?: any;
  text?: string;
  durationMs?: number;
};

export type AgentStep = {
  turn: number;
  durationMs: number;
  events: ToolEvent[];
};

export type AgentTrace = {
  court: string;
  agentId: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  steps: AgentStep[];
  extraction: {
    durationMs: number;
    usage: StepUsage;
    result: ExpertFinderResult | null;
  } | null;
  result: ExpertFinderResult | null;
  totalUsage: StepUsage;
  rawToolData: {
    pageTitle: string;
    pageText: string;
    pdfLinks: Array<{ url: string; text: string; relevanceHint: string }>;
    pdfText: string;
  };
  error: string | null;
};

export async function tracedCourtSearch(
  court: string,
  agentId: string = "expert-search-mini"
): Promise<AgentTrace> {
  const totalStart = Date.now();
  const startedAt = new Date().toISOString();
  const steps: AgentStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const rawToolData = {
    pageTitle: "",
    pageText: "",
    pdfLinks: [] as Array<{ url: string; text: string; relevanceHint: string }>,
    pdfText: "",
  };

  try {
    const agent = mastra.getAgent(agentId);
    const agentStart = Date.now();

    // Track steps via onStepFinish
    let currentTurn = 0;
    let currentEvents: ToolEvent[] = [];
    let turnStart = Date.now();

    const agentResult = await agent.generate(
      `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      {
        maxSteps: 15,
        onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          // Capture tool calls
          for (const tc of toolCalls || []) {
            currentEvents.push({
              type: "tool_call",
              toolName: tc.toolName || "provider-tool",
              input: tc.args,
            });
          }

          // Capture tool results from payload
          for (const tr of toolResults || []) {
            const p = (tr as any).payload;
            if (p) {
              const fullResult = p.result;

              // Keep raw data
              if (p.toolName === "fetchPage" && fullResult?.success) {
                rawToolData.pageTitle = fullResult.title || "";
                rawToolData.pageText = fullResult.pageText || "";
                rawToolData.pdfLinks = fullResult.pdfLinks || [];
              }
              if (p.toolName === "extractPdfDate" && fullResult?.success) {
                rawToolData.pdfText = fullResult.pdfText || "";
              }

              currentEvents.push({
                type: "tool_result",
                toolName: p.toolName || "provider-tool",
                fullResult,
                durationMs: 0,
              });
            }
          }

          // Capture text
          if (text) {
            currentEvents.push({ type: "model_text", text: text.slice(0, 1000) });
          }

          // Save step
          steps.push({
            turn: currentTurn,
            durationMs: Date.now() - turnStart,
            events: [...currentEvents],
          });

          totalInputTokens += usage?.inputTokens ?? 0;
          totalOutputTokens += usage?.outputTokens ?? 0;

          currentTurn++;
          currentEvents = [];
          turnStart = Date.now();
        },
      }
    );

    // ── Extraction step ─────────────────────────────────────────────

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
${rawToolData.pageTitle || "not available"}

## Page text (first 2000 chars):
${rawToolData.pageText.slice(0, 2000) || "not available"}

## PDF links found on the page:
${rawToolData.pdfLinks.length > 0 ? rawToolData.pdfLinks.map(p => `- [${p.relevanceHint}] "${p.text}" → ${p.url}`).join("\n") : "none"}

## PDF content (first 1500 chars):
${rawToolData.pdfText.slice(0, 1500) || "not available"}

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
    const extractionUsage: StepUsage = {
      inputTokens: extractResult.usage?.inputTokens ?? 0,
      outputTokens: extractResult.usage?.outputTokens ?? 0,
      totalTokens: extractResult.usage?.totalTokens ?? 0,
    };
    totalInputTokens += extractionUsage.inputTokens;
    totalOutputTokens += extractionUsage.outputTokens;

    const parsed = expertFinderResultSchema.parse(extractResult.output);

    return {
      court,
      agentId,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - totalStart,
      steps,
      extraction: { durationMs: extractionMs, usage: extractionUsage, result: parsed },
      result: parsed,
      totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens },
      rawToolData: {
        pageTitle: rawToolData.pageTitle,
        pageText: rawToolData.pageText.slice(0, 2000),
        pdfLinks: rawToolData.pdfLinks,
        pdfText: rawToolData.pdfText.slice(0, 1500),
      },
      error: null,
    };
  } catch (error) {
    return {
      court,
      agentId,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - totalStart,
      steps,
      extraction: null,
      result: null,
      totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens },
      rawToolData: {
        pageTitle: rawToolData.pageTitle,
        pageText: rawToolData.pageText.slice(0, 2000),
        pdfLinks: rawToolData.pdfLinks,
        pdfText: rawToolData.pdfText.slice(0, 1500),
      },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Pretty print a trace ──────────────────────────────────────────

export function printTrace(trace: AgentTrace) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`AGENT LOOP — ${trace.steps.length} turns (${trace.agentId})`);
  console.log("═".repeat(70));

  for (const step of trace.steps) {
    console.log(`\n── Turn ${step.turn} (${(step.durationMs / 1000).toFixed(1)}s) ──`);

    for (const event of step.events) {
      switch (event.type) {
        case "tool_call":
          console.log(`  📞 Call ${event.toolName}(${JSON.stringify(event.input)?.slice(0, 100)})`);
          break;

        case "tool_result": {
          const status = event.fullResult?.success !== false ? "✓" : "✗";
          console.log(`  📦 ${status} ${event.toolName} result`);

          if (event.toolName === "fetchPage" && event.fullResult?.success) {
            console.log(`     Title: ${event.fullResult.title}`);
            console.log(`     PDFs found: ${event.fullResult.pdfLinks?.length || 0}`);
            for (const pdf of event.fullResult.pdfLinks || []) {
              console.log(`       [${pdf.relevanceHint}] "${pdf.text?.slice(0, 60)}" → ${pdf.url}`);
            }
          } else if (event.toolName === "extractPdfDate" && event.fullResult?.success) {
            console.log(`     Pages: ${event.fullResult.pageCount}`);
            console.log(`     Text: ${event.fullResult.pdfText?.slice(0, 200)}...`);
          } else if (event.fullResult?.error) {
            console.log(`     Error: ${event.fullResult.error}`);
          }
          break;
        }

        case "web_search":
          console.log(`  🔍 Web search`);
          break;

        case "model_text":
          console.log(`  💬 Agent: ${event.text?.slice(0, 200)}${(event.text?.length ?? 0) > 200 ? "..." : ""}`);
          break;
      }
    }
  }

  if (trace.extraction) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`EXTRACTION (${(trace.extraction.durationMs / 1000).toFixed(1)}s)`);
    console.log("═".repeat(70));
    console.log(`  Tokens: in=${trace.extraction.usage.inputTokens} out=${trace.extraction.usage.outputTokens}`);

    if (trace.extraction.result) {
      const r = trace.extraction.result;
      console.log(`  Date: ${r.publicationDate} (${r.publicationDateSource})`);
      console.log(`  Page: ${r.pageUrl}`);
      console.log(`  PDF: ${r.documentUrl}`);
      console.log(`  Reasoning: ${r.dateExtractionExplanation?.slice(0, 300)}`);
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`SUMMARY`);
  console.log("═".repeat(70));
  console.log(`  Status: ${trace.error ? `✗ ${trace.error}` : "✓ Success"}`);
  console.log(`  Date: ${trace.result?.publicationDate || "none"} (${trace.result?.publicationDateSource || "n/a"})`);
  console.log(`  Time: ${(trace.totalMs / 1000).toFixed(1)}s | Turns: ${trace.steps.length}`);
  console.log(`  Tokens: in=${trace.totalUsage.inputTokens} out=${trace.totalUsage.outputTokens}`);
  const cost = (trace.totalUsage.inputTokens / 1e6) * 0.75 + (trace.totalUsage.outputTokens / 1e6) * 4.5;
  console.log(`  Cost: $${cost.toFixed(4)}`);
}
