/**
 * Native OpenAI SDK implementation — no Mastra, no AI SDK.
 * Uses the Responses API with web_search_preview + custom function tools.
 * Manual agent loop + structured extraction via responses.parse().
 *
 * Full trace: every API call, tool call, decision, and token usage is recorded.
 */
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import * as cheerio from "cheerio";
import {
  expertFinderResultSchema,
  type ExpertFinderResult,
} from "../mastra/schemas/expert-finder.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "../mastra/agents/instructions.ts";

const client = new OpenAI();

// ── Trace types ─────────────────────────────────────────────────────

export type StepUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type WebSearchEvent = {
  type: "web_search";
  id: string;
};

export type FunctionCallEvent = {
  type: "function_call";
  name: string;
  arguments: Record<string, any>;
  callId: string;
};

export type FunctionResultEvent = {
  type: "function_result";
  name: string;
  callId: string;
  /** The compact string sent back to the model */
  compactOutput: string;
  /** The full raw result we kept for extraction */
  fullResult: any;
  durationMs: number;
};

export type ModelTextEvent = {
  type: "model_text";
  text: string;
};

export type AgentStep = {
  turn: number;
  startedAt: string;
  durationMs: number;
  usage: StepUsage;
  /** Raw output item types from the API response */
  outputItemTypes: string[];
  /** Every event that happened in this turn */
  events: Array<WebSearchEvent | FunctionCallEvent | FunctionResultEvent | ModelTextEvent>;
};

export type ExtractionStep = {
  startedAt: string;
  durationMs: number;
  usage: StepUsage;
  prompt: string;
  result: ExpertFinderResult | null;
};

export type AgentTrace = {
  court: string;
  model: string;
  effort: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  /** Every turn of the agent loop */
  steps: AgentStep[];
  /** The extraction step */
  extraction: ExtractionStep | null;
  /** Final structured result */
  result: ExpertFinderResult | null;
  /** Aggregated usage across all steps */
  totalUsage: StepUsage;
  /** Raw tool data collected for extraction */
  rawToolData: RawToolData;
  error: string | null;
};

export type RawToolData = {
  pageTitle: string;
  pageText: string;
  pdfLinks: Array<{ url: string; text: string; relevanceHint: string }>;
  pdfText: string;
  dateHints: string[];
};

// ── Tool definitions for the Responses API ──────────────────────────

const tools: OpenAI.Responses.Tool[] = [
  {
    type: "web_search",
    user_location: {
      type: "approximate",
      country: "FR",
      region: "Île-de-France",
      city: "Paris",
    },
  },
  {
    type: "function" as const,
    name: "fetchPage",
    description:
      "Fetches a webpage and extracts all PDF links with their text. Returns PDF links with relevance hints and date-related text found on the page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the webpage to fetch and analyze",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "extractPdfDate",
    description:
      "Downloads a PDF and extracts text from the first 5 pages. Returns raw text for you to find the official publication date. Look for 'arrêtée au', 'MAJ', 'mise à jour', dates near headers.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the PDF document to analyze",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ── Tool implementations (same logic as Mastra tools) ───────────────

async function executeFetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { success: false, title: null, pageText: "", pdfLinks: [] as any[], dateHints: [] as string[], error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $("title").text().trim() || $("h1").first().text().trim() || null;

    $("script, style, nav, footer").remove();
    const pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);

    const pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];

    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      let fullUrl: string;
      try { fullUrl = new URL(href, url).toString(); } catch { fullUrl = href; }

      const linkText = $(el).text().trim();
      const parentText = $(el).parent().text().trim().slice(0, 300);

      let filename: string;
      try { filename = decodeURIComponent(fullUrl.split("/").pop() || ""); } catch { filename = fullUrl.split("/").pop() || ""; }

      const lowerUrl = fullUrl.toLowerCase();
      const lowerText = (linkText + " " + parentText + " " + filename).toLowerCase();
      let relevanceHint = "unknown";

      if (lowerUrl.includes("expert") || lowerText.includes("expert") || lowerUrl.includes("annuaire") || lowerText.includes("annuaire")) {
        relevanceHint = "likely-expert-list";
      } else if (lowerUrl.includes("liste") || lowerText.includes("liste")) {
        relevanceHint = "possible-expert-list";
      } else if (lowerUrl.includes("tarif") || lowerUrl.includes("formulaire") || lowerText.includes("tarif") || lowerText.includes("formulaire")) {
        relevanceHint = "not-expert-list";
      }

      pdfLinks.push({
        url: fullUrl,
        text: linkText || parentText.slice(0, 100) || filename || "No text",
        relevanceHint,
      });
    });

    const dateHints = pageText.match(
      /(?:mise à jour|MAJ|actualis[ée])[^.]{0,50}?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/gi
    ) || [];

    return { success: true, title, pageText, pdfLinks, dateHints, error: null };
  } catch (error) {
    return { success: false, title: null, pageText: "", pdfLinks: [] as any[], dateHints: [] as string[], error: error instanceof Error ? error.message : "Unknown error fetching page" };
  }
}

async function executeExtractPdfDate(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)" },
    });

    if (!response.ok) {
      return { success: false, pdfText: "", pageCount: 0, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !url.endsWith(".pdf")) {
      return { success: false, pdfText: "", pageCount: 0, error: `Not a PDF: content-type is ${contentType}` };
    }

    const buffer = await response.arrayBuffer();
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const pageCount = pdf.numPages;

    let pdfText = "";
    for (let i = 1; i <= Math.min(5, pageCount); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pdfText += textContent.items.map((item: any) => (item as { str?: string }).str || "").join(" ") + "\n\n";
    }
    pdfText = pdfText.replace(/\s+/g, " ").trim();

    return { success: true, pdfText, pageCount, error: null };
  } catch (error) {
    return { success: false, pdfText: "", pageCount: 0, error: error instanceof Error ? error.message : "Unknown error extracting PDF text" };
  }
}

// ── Compact tool output for the agent (matches toModelOutput) ───────

function compactFetchPageResult(result: Awaited<ReturnType<typeof executeFetchPage>>): string {
  if (!result.success) return `Error fetching page: ${result.error}`;
  const lines = [
    `Title: ${result.title}`,
    `PDF links (${result.pdfLinks.length}):`,
    ...result.pdfLinks.map((p) => `  - [${p.relevanceHint}] "${p.text}" → ${p.url}`),
    result.dateHints.length ? `Date hints from page: ${result.dateHints.join("; ")}` : "No date patterns found in page text",
  ];
  return lines.join("\n");
}

function compactExtractPdfResult(result: Awaited<ReturnType<typeof executeExtractPdfDate>>): string {
  if (!result.success) return `Error extracting PDF: ${result.error}`;
  return `PDF (${result.pageCount} pages). First page text:\n${result.pdfText.slice(0, 500)}`;
}

// ── Function dispatch ───────────────────────────────────────────────

const functionHandlers: Record<string, (args: any) => Promise<any>> = {
  fetchPage: async (args: { url: string }) => executeFetchPage(args.url),
  extractPdfDate: async (args: { url: string }) => executeExtractPdfDate(args.url),
};

// ── Main: returns full trace ────────────────────────────────────────

export type NativeEffort = "none" | "low" | "medium" | "high";

export async function runCourtSearchNative(
  court: string,
  effort: NativeEffort = "none"
): Promise<AgentTrace> {
  const totalStart = Date.now();
  const startedAt = new Date().toISOString();

  const steps: AgentStep[] = [];
  let rawToolData: RawToolData = { pageTitle: "", pageText: "", pdfLinks: [], pdfText: "", dateHints: [] };
  let agentText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // ── Agent loop ────────────────────────────────────────────────────

    let currentInput: OpenAI.Responses.ResponseInput = [
      { role: "system", content: EXPERT_SEARCH_INSTRUCTIONS },
      {
        role: "user",
        content: `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
      },
    ];

    const MAX_TURNS = 15;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const turnStart = Date.now();
      const turnEvents: AgentStep["events"] = [];

      const response = await client.responses.create({
        model: "gpt-5.4-mini",
        input: currentInput,
        tools,
        ...(effort !== "none" ? { reasoning: { effort } } : {}),
      });

      const stepUsage: StepUsage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      };
      totalInputTokens += stepUsage.inputTokens;
      totalOutputTokens += stepUsage.outputTokens;

      // Parse every output item
      const outputItemTypes = response.output.map((item) => item.type);

      for (const item of response.output) {
        if (item.type === "web_search_call") {
          turnEvents.push({ type: "web_search", id: item.id });
        } else if (item.type === "function_call") {
          turnEvents.push({
            type: "function_call",
            name: item.name,
            arguments: JSON.parse(item.arguments),
            callId: item.call_id,
          });
        } else if (item.type === "message") {
          // Extract text from message content
          const textParts = item.content
            .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === "output_text")
            .map((c) => c.text);
          if (textParts.length > 0) {
            turnEvents.push({ type: "model_text", text: textParts.join("\n") });
          }
        }
      }

      // Check for function calls
      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionCallItem => item.type === "function_call"
      );

      if (functionCalls.length === 0) {
        // Agent is done
        agentText = response.output_text;

        steps.push({
          turn,
          startedAt: new Date(turnStart).toISOString(),
          durationMs: Date.now() - turnStart,
          usage: stepUsage,
          outputItemTypes,
          events: turnEvents,
        });
        break;
      }

      // Append all output items to input for next turn
      currentInput = [...(currentInput as any[]), ...(response.output as any[])];

      // Execute each function call
      for (const toolCall of functionCalls) {
        const handler = functionHandlers[toolCall.name];
        if (!handler) {
          turnEvents.push({
            type: "function_result",
            name: toolCall.name,
            callId: toolCall.call_id,
            compactOutput: `Error: unknown function ${toolCall.name}`,
            fullResult: null,
            durationMs: 0,
          });
          currentInput = [
            ...(currentInput as any[]),
            { type: "function_call_output" as const, call_id: toolCall.call_id, output: JSON.stringify({ error: `Unknown function: ${toolCall.name}` }) },
          ];
          continue;
        }

        const args = JSON.parse(toolCall.arguments);
        const toolStart = Date.now();
        const fullResult = await handler(args);
        const toolDuration = Date.now() - toolStart;

        // Keep raw data for extraction
        if (toolCall.name === "fetchPage" && fullResult.success) {
          rawToolData.pageTitle = fullResult.title || "";
          rawToolData.pageText = fullResult.pageText || "";
          rawToolData.pdfLinks = fullResult.pdfLinks || [];
          rawToolData.dateHints = fullResult.dateHints || [];
        }
        if (toolCall.name === "extractPdfDate" && fullResult.success) {
          rawToolData.pdfText = fullResult.pdfText || "";
        }

        // Compact version for the agent
        const compactOutput =
          toolCall.name === "fetchPage"
            ? compactFetchPageResult(fullResult)
            : compactExtractPdfResult(fullResult);

        turnEvents.push({
          type: "function_result",
          name: toolCall.name,
          callId: toolCall.call_id,
          compactOutput,
          fullResult,
          durationMs: toolDuration,
        });

        currentInput = [
          ...(currentInput as any[]),
          { type: "function_call_output" as const, call_id: toolCall.call_id, output: compactOutput },
        ];
      }

      steps.push({
        turn,
        startedAt: new Date(turnStart).toISOString(),
        durationMs: Date.now() - turnStart,
        usage: stepUsage,
        outputItemTypes,
        events: turnEvents,
      });
    }

    // ── Extraction step ─────────────────────────────────────────────

    const extractionStart = Date.now();

    const extractionPrompt = `You are analyzing date signals from a French court expert directory search.

## Court: ${court}

## Agent summary:
${agentText.slice(0, 2000)}

## Page title:
${rawToolData.pageTitle || "not available"}

## Page text (first 2000 chars):
${rawToolData.pageText.slice(0, 2000) || "not available"}

## PDF links found on the page:
${rawToolData.pdfLinks.length > 0 ? rawToolData.pdfLinks.map((p) => `- [${p.relevanceHint}] "${p.text}" → ${p.url}`).join("\n") : "none"}

## PDF content (first 1500 chars):
${rawToolData.pdfText.slice(0, 1500) || "not available"}

Determine the publication date. Check ALL sources:
1. Exact date in PDF text (e.g. "MAJ LE 10/03/2026", "assemblée du 18 novembre 2025")
2. Exact date in page text (e.g. "mise à jour : 24/02/2026")
3. Date in PDF link anchor text
4. Date in the PDF URL path (e.g. "/2025-07/" means July 2025, "/2026-03/" means March 2026)
5. Year only as last resort

Use the most specific and most recent date. A year-only date must not override an exact date.
Date format: YYYY-MM-DD.`;

    const extractResult = await client.responses.parse({
      model: "gpt-5.4-mini",
      input: [{ role: "user", content: extractionPrompt }],
      text: { format: zodTextFormat(expertFinderResultSchema, "expert_finder_result") },
      reasoning: { effort: "medium" as const },
    });

    const extractionMs = Date.now() - extractionStart;

    const extractionUsage: StepUsage = {
      inputTokens: extractResult.usage?.input_tokens ?? 0,
      outputTokens: extractResult.usage?.output_tokens ?? 0,
      totalTokens: (extractResult.usage?.input_tokens ?? 0) + (extractResult.usage?.output_tokens ?? 0),
    };
    totalInputTokens += extractionUsage.inputTokens;
    totalOutputTokens += extractionUsage.outputTokens;

    const parsed = extractResult.output_parsed;
    if (!parsed) throw new Error("Structured output parsing returned null");

    const validated = expertFinderResultSchema.parse(parsed);

    return {
      court,
      model: "gpt-5.4-mini",
      effort,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - totalStart,
      steps,
      extraction: {
        startedAt: new Date(extractionStart).toISOString(),
        durationMs: extractionMs,
        usage: extractionUsage,
        prompt: extractionPrompt,
        result: validated,
      },
      result: validated,
      totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens },
      rawToolData: {
        pageTitle: rawToolData.pageTitle,
        pageText: rawToolData.pageText.slice(0, 2000),
        pdfLinks: rawToolData.pdfLinks,
        pdfText: rawToolData.pdfText.slice(0, 1500),
        dateHints: rawToolData.dateHints,
      },
      error: null,
    };
  } catch (error) {
    return {
      court,
      model: "gpt-5.4-mini",
      effort,
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
        dateHints: rawToolData.dateHints,
      },
      error: error instanceof Error ? `${error.message}\n${error.stack}` : "Unknown error",
    };
  }
}
