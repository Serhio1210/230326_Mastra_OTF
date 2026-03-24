import { test, expect } from "bun:test";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

test("Paris — clean extraction: agent gathers data, Sonnet 4.6 extracts with native structured output", async () => {
  // Step 1: Agent gathers the raw data (search + fetch + PDF)
  const agent = mastra.getAgent("expert-search-agent");

  const agentResult = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Utilise fetchPage puis extractPdfDate. Donne-moi: l'URL de la page, l'URL du PDF, le nom du fichier, le texte de la page (date hints), et le texte du PDF (premières pages).",
    { maxSteps: 15 }
  );

  // Step 2: Build a clean prompt from the agent's response
  const agentSummary = agentResult.text.slice(0, 3000);

  const extractionPrompt = `You are extracting structured data from French court expert directory search results.

## Court: Paris (Cour d'appel de Paris)

## Agent's findings:
${agentSummary}

Extract the structured data from the agent's findings above.
The date inside the PDF is the AUTHORITATIVE source (publicationDateSource: "pdf-content").
Common date patterns: "MAJ LE 10/03/2026" → 2026-03-10, "Liste arrêtée au 14 janvier 2025" → 2025-01-14.
Date format: YYYY-MM-DD. Convert French dates (DD/MM/YYYY → YYYY-MM-DD).`;

  // Step 3: Single Sonnet 4.6 call with native structured output, no tools
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
    prompt: extractionPrompt,
  });

  const parsed = expertFinderResultSchema.parse(output);

  // Court name
  expect(parsed.courtName.toLowerCase()).toContain("paris");

  // Official page URL
  expect(parsed.pageUrl).not.toBeNull();
  expect(parsed.pageUrl).toContain("cours-appel.justice.fr/paris");

  // Document should be a PDF on justice.fr
  expect(parsed.documentUrl).not.toBeNull();
  expect(parsed.documentUrl).toContain(".justice.fr");
  expect(parsed.documentUrl).toMatch(/\.pdf$/i);

  // Publication date — 2026 from PDF content
  expect(parsed.publicationDate).toMatch(/^2026-\d{2}-\d{2}$/);

  // Date source should be pdf-content
  expect(parsed.publicationDateSource).toBe("pdf-content");

  // Explanations
  expect(parsed.searchExplanation.length).toBeGreaterThan(10);
  expect(parsed.dateExtractionExplanation.length).toBeGreaterThan(10);

  // No errors
  expect(parsed.errors).toEqual([]);

  console.log("\nResult:", JSON.stringify(parsed, null, 2));
}, 300_000);
