import { test, expect } from "bun:test";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const STRUCTURING_OPTIONS = {
  schema: expertFinderResultSchema,
  model: "anthropic/claude-haiku-4-5" as const,
  instructions: `Extract the court expert search results from the agent's response.
Look for: court name, page URL on justice.fr, PDF document URL and title,
publication date in YYYY-MM-DD format, and where the date was found
(pdf-content, page-text, link-text, filename, or not-found).
Also extract the search explanation, date extraction explanation, and any errors.`,
  errorStrategy: "warn" as const,
};

test("Paris — optimized pipeline: toModelOutput + Sonnet 4.6 structuring", async () => {
  const agent = mastra.getAgent("expert-search-agent");

  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.",
    {
      maxSteps: 15,
      structuredOutput: STRUCTURING_OPTIONS,
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
