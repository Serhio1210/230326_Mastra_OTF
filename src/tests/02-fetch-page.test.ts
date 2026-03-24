import { test, expect } from "bun:test";
import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";

const PARIS_EXPERTS_URL = "https://www.cours-appel.justice.fr/paris/experts-judiciaires";

test("fetchPage — Paris experts page returns PDF links", async () => {
  const result = await fetchPageTool.execute({ url: PARIS_EXPERTS_URL });

  // Should succeed
  expect(result.success).toBe(true);
  expect(result.error).toBeNull();

  // Should have a title
  expect(result.title).not.toBeNull();

  // Should find PDF links
  expect(result.pdfLinks.length).toBeGreaterThan(0);

  // At least one PDF should be tagged as likely-expert-list
  const expertPdfs = result.pdfLinks.filter((p) => p.relevanceHint === "likely-expert-list");
  expect(expertPdfs.length).toBeGreaterThan(0);

  // Expert PDFs should be on justice.fr and end with .pdf
  for (const pdf of expertPdfs) {
    expect(pdf.url).toContain(".justice.fr");
    expect(pdf.url).toMatch(/\.pdf$/i);
  }

  // Page text should contain expert-related content
  expect(result.pageText.toLowerCase()).toContain("expert");

  console.log("\nTitle:", result.title);
  console.log("PDF links found:", result.pdfLinks.length);
  console.log("Expert PDFs:", expertPdfs.length);
  for (const pdf of expertPdfs) {
    console.log(`  - ${pdf.text.slice(0, 80)}`);
    console.log(`    ${pdf.url}`);
  }
}, 30_000);

test("fetchPage — returns error for invalid URL", async () => {
  const result = await fetchPageTool.execute({ url: "https://this-does-not-exist.invalid/page" });

  expect(result.success).toBe(false);
  expect(result.error).not.toBeNull();
  expect(result.pdfLinks).toEqual([]);
}, 15_000);
