import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as cheerio from "cheerio";

export const fetchPageTool = createTool({
  id: "fetch-page",
  description:
    "Fetches a webpage and extracts all PDF links with their text. Returns the FULL PAGE TEXT in pageText field — analyze this text to find publication dates (look for 'MAJ', 'mise à jour', dates near PDF links, etc.). French dates use DD/MM/YYYY format.",
  inputSchema: z.object({
    url: z.string().describe("The URL of the webpage to fetch and analyze"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    title: z.string().nullable(),
    pageText: z
      .string()
      .describe("Full text content of the page for the agent to analyze for publication dates"),
    pdfLinks: z.array(
      z.object({
        url: z.string(),
        text: z.string(),
        relevanceHint: z.string(),
      })
    ),
    error: z.string().nullable(),
  }),
  execute: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          title: null,
          pageText: "",
          pdfLinks: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract page title
      const title = $("title").text().trim() || $("h1").first().text().trim() || null;

      // Extract full page text (remove scripts/styles, clean whitespace)
      $("script, style, nav, footer").remove();
      const pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);

      // Extract all PDF links
      const pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];

      $('a[href*=".pdf"]').each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        // Resolve relative URLs
        let fullUrl: string;
        try {
          fullUrl = new URL(href, url).toString();
        } catch {
          fullUrl = href;
        }

        // Get link text and surrounding context
        const linkText = $(el).text().trim();
        const parentText = $(el).parent().text().trim().slice(0, 300);

        // Extract filename from URL
        let filename: string;
        try {
          filename = decodeURIComponent(fullUrl.split("/").pop() || "");
        } catch {
          filename = fullUrl.split("/").pop() || "";
        }

        // Determine relevance for expert lists
        const lowerUrl = fullUrl.toLowerCase();
        const lowerText = (linkText + " " + parentText + " " + filename).toLowerCase();
        let relevanceHint = "unknown";

        if (
          lowerUrl.includes("expert") ||
          lowerText.includes("expert") ||
          lowerUrl.includes("annuaire") ||
          lowerText.includes("annuaire")
        ) {
          relevanceHint = "likely-expert-list";
        } else if (lowerUrl.includes("liste") || lowerText.includes("liste")) {
          relevanceHint = "possible-expert-list";
        } else if (
          lowerUrl.includes("tarif") ||
          lowerUrl.includes("formulaire") ||
          lowerText.includes("tarif") ||
          lowerText.includes("formulaire")
        ) {
          relevanceHint = "not-expert-list";
        }

        pdfLinks.push({
          url: fullUrl,
          text: linkText || parentText.slice(0, 100) || filename || "No text",
          relevanceHint,
        });
      });

      return { success: true, title, pageText, pdfLinks, error: null };
    } catch (error) {
      return {
        success: false,
        title: null,
        pageText: "",
        pdfLinks: [],
        error: error instanceof Error ? error.message : "Unknown error fetching page",
      };
    }
  },
});
