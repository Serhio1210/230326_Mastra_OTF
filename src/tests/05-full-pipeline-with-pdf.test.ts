import { test, expect } from "bun:test";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

test("Paris — full pipeline: web search + fetchPage + extractPdfDate", async () => {
  const agent = mastra.getAgent("expert-search-agent");

  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Trouve le site web officiel, utilise fetchPage pour extraire les liens PDF, choisis le PDF le plus récent, puis utilise extractPdfDate pour lire le contenu du PDF et trouver la date officielle de publication.",
    {
      structuredOutput: {
        schema: expertFinderResultSchema,
        model: "anthropic/claude-haiku-4-5",
      },
      maxSteps: 15,
    }
  );

  const output = result.object;
  const parsed = expertFinderResultSchema.parse(output);

  // Court name
  expect(parsed.courtName.toLowerCase()).toContain("paris");

  // Official page URL must be on justice.fr
  expect(parsed.pageUrl).not.toBeNull();
  expect(parsed.pageUrl).toContain("cours-appel.justice.fr/paris");

  // Document should be a PDF on justice.fr
  expect(parsed.documentUrl).not.toBeNull();
  expect(parsed.documentUrl).toContain(".justice.fr");
  expect(parsed.documentUrl).toMatch(/\.pdf$/i);

  // Publication date should be a valid YYYY-MM-DD in 2026
  expect(parsed.publicationDate).toMatch(/^2026-\d{2}-\d{2}$/);

  // Date source should be pdf-content (the authoritative source)
  expect(parsed.publicationDateSource).toBe("pdf-content");

  // Explanations should not be empty
  expect(parsed.searchExplanation.length).toBeGreaterThan(10);
  expect(parsed.dateExtractionExplanation.length).toBeGreaterThan(10);

  // No errors
  expect(parsed.errors).toEqual([]);

  console.log("\nResult:", JSON.stringify(parsed, null, 2));
}, 300_000);
