import { test, expect } from "bun:test";
import { mastra } from "./mastra/index.ts";
import { expertFinderResultSchema } from "./mastra/schemas/expert-finder.ts";

test("Paris — returns structured output with correct official URL", async () => {
  const agent = mastra.getAgent("expert-search-agent");

  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Trouve le site web officiel, le lien vers le PDF de la liste, et la date de publication.",
    {
      structuredOutput: {
        schema: expertFinderResultSchema,
      },
    }
  );

  const output = result.object;

  // Schema validation — should parse without errors
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

  // Date source should be one of the valid enum values
  expect(parsed.publicationDateSource).not.toBe("not-found");

  // Explanations should not be empty
  expect(parsed.searchExplanation.length).toBeGreaterThan(10);
  expect(parsed.dateExtractionExplanation.length).toBeGreaterThan(10);

  // No errors
  expect(parsed.errors).toEqual([]);

  console.log("\nResult:", JSON.stringify(parsed, null, 2));
}, 120_000);
