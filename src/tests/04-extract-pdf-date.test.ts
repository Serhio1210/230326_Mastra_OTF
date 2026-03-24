import { test, expect } from "bun:test";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";

const PARIS_PDF_URL =
  "https://www.cours-appel.justice.fr/sites/default/files/2026-03/ANNUPARIS%20MAJ%2010%20MARS%2026_2.pdf";

test("extractPdfDate — Paris PDF returns text with date information", async () => {
  const result = await extractPdfDateTool.execute({ url: PARIS_PDF_URL });

  // Should succeed
  expect(result.success).toBe(true);
  expect(result.error).toBeNull();

  // Should have pages
  expect(result.pageCount).toBeGreaterThan(0);

  // PDF text should not be empty
  expect(result.pdfText.length).toBeGreaterThan(100);

  // Should contain expert-related content
  const lower = result.pdfText.toLowerCase();
  expect(lower.includes("expert") || lower.includes("cour d'appel") || lower.includes("paris")).toBe(true);

  console.log("\nPage count:", result.pageCount);
  console.log("Text length:", result.pdfText.length);
  console.log("First 500 chars:", result.pdfText.slice(0, 500));
}, 60_000);

test("extractPdfDate — returns error for invalid URL", async () => {
  const result = await extractPdfDateTool.execute({ url: "https://this-does-not-exist.invalid/file.pdf" });

  expect(result.success).toBe(false);
  expect(result.error).not.toBeNull();
  expect(result.pdfText).toBe("");
}, 15_000);
