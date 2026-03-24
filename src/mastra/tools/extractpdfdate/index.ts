import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const extractPdfDateTool = createTool({
  id: "extract-pdf-date",
  description:
    "Downloads a PDF and extracts text from the first 5 pages. Returns raw text for YOU to analyze and find the official publication date. The date inside the PDF is the AUTHORITATIVE legal date. Look for 'arrêtée au', 'MAJ', 'mise à jour', dates near headers.",
  inputSchema: z.object({
    url: z.string().describe("The URL of the PDF document to analyze"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    pdfText: z
      .string()
      .describe("Extracted text from first 5 pages of the PDF"),
    pageCount: z.number().describe("Total number of pages in the PDF"),
    error: z.string().nullable(),
  }),
  execute: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          pdfText: "",
          pageCount: 0,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("pdf") && !url.endsWith(".pdf")) {
        return {
          success: false,
          pdfText: "",
          pageCount: 0,
          error: `Not a PDF: content-type is ${contentType}`,
        };
      }

      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(uint8Array);
      const pageCount = pdf.numPages;

      // Extract text from first 5 pages (dates are at the start)
      const pagesToExtract = Math.min(5, pageCount);
      let pdfText = "";

      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (item as { str?: string }).str || "")
          .join(" ");
        pdfText += pageText + "\n\n";
      }

      pdfText = pdfText.replace(/\s+/g, " ").trim();

      return { success: true, pdfText, pageCount, error: null };
    } catch (error) {
      return {
        success: false,
        pdfText: "",
        pageCount: 0,
        error: error instanceof Error ? error.message : "Unknown error extracting PDF text",
      };
    }
  },
  // Compact output for the model — only the first 500 chars where dates live
  toModelOutput: (output) => {
    if (!output.success) {
      return { type: "text" as const, value: `Error extracting PDF: ${output.error}` };
    }

    return {
      type: "text" as const,
      value: `PDF (${output.pageCount} pages). First page text:\n${output.pdfText.slice(0, 500)}`,
    };
  },
});
