import { test, expect } from "bun:test";
import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

test("Paris — full pipeline: web search + fetchPage → structured output", async () => {
  const agent = mastra.getAgent("expert-search-agent");

  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Trouve le site web officiel, le lien vers le PDF de la liste, et la date de publication.",
    {
      structuredOutput: {
        schema: expertFinderResultSchema,
      },
      maxSteps: 10,
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

  // Publication date should be a valid YYYY-MM-DD
  expect(parsed.publicationDate).not.toBeNull();
  expect(parsed.publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // With fetchPage, the date should be 2026 (the page has a March 2026 update)
  expect(parsed.publicationDate!.startsWith("2026")).toBe(true);

  // Date source — with fetchPage available, should come from filename or link-text
  expect(["filename", "link-text", "page-text"]).toContain(parsed.publicationDateSource);

  // Explanations should not be empty
  expect(parsed.searchExplanation.length).toBeGreaterThan(10);
  expect(parsed.dateExtractionExplanation.length).toBeGreaterThan(10);

  // No errors
  expect(parsed.errors).toEqual([]);

  console.log("\nResult:", JSON.stringify(parsed, null, 2));
}, 120_000);
