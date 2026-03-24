import { test, expect } from "bun:test";
import { runCourtSearch } from "../lib/run-court-search.ts";

// Test 3 courts with different patterns to validate the pipeline
const TEST_COURTS = [
  { name: "Paris", expectModernSite: true },
  { name: "Aix-en-Provence", expectModernSite: true },
  { name: "Bordeaux", expectModernSite: true },
];

for (const { name, expectModernSite } of TEST_COURTS) {
  test(`${name} — clean extraction pipeline`, async () => {
    const result = await runCourtSearch(name);

    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();

    const r = result.result!;

    // Court name should reference the city
    expect(r.courtName.toLowerCase()).toContain(name.toLowerCase());

    // Page URL should be on justice.fr
    expect(r.pageUrl).not.toBeNull();
    expect(r.pageUrl).toContain(".justice.fr");

    // Document should be a PDF
    expect(r.documentUrl).not.toBeNull();
    expect(r.documentUrl).toMatch(/\.pdf$/i);

    // Publication date should be valid YYYY-MM-DD
    expect(r.publicationDate).not.toBeNull();
    expect(r.publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Date source should not be not-found
    expect(r.publicationDateSource).not.toBe("not-found");

    // No errors
    expect(r.errors).toEqual([]);

    console.log(`\n${name}: ${r.publicationDate} (${r.publicationDateSource}) — ${(result.timing.totalMs / 1000).toFixed(1)}s`);
    console.log(`  Page: ${r.pageUrl}`);
    console.log(`  PDF: ${r.documentUrl}`);
  }, 300_000);
}
