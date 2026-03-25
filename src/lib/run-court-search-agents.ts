/**
 * 3-Step Court Search Pipeline — OpenAI Agents SDK
 *
 * Step 1: DISCOVER — Agent with web_search finds the page + PDF
 * Step 2: COLLECT  — Deterministic parsing of all date signals (no LLM)
 * Step 3: DECIDE   — Agent with structured output picks the best date
 *
 * Built-in tracing: every run() creates spans visible at platform.openai.com/traces
 */
import { Agent, run, withTrace, webSearchTool } from "@openai/agents";
import { z } from "zod";
import * as cheerio from "cheerio";
import {
  expertFinderResultSchema,
  type ExpertFinderResult,
} from "../mastra/schemas/expert-finder.ts";

// ── Schemas ─────────────────────────────────────────────────────────

const discoverResultSchema = z.object({
  found: z.boolean().describe("Whether the expert list page and a PDF were found"),
  pageUrl: z.string().nullable().describe("URL of the experts page"),
  pdfUrl: z.string().nullable().describe("URL of the expert list PDF"),
  pdfTitle: z.string().nullable().describe("Title/text of the PDF link"),
  searchExplanation: z.string().describe("How the page and PDF were found"),
  errors: z.array(z.string()).describe("Any errors encountered"),
});

type DiscoverResult = z.infer<typeof discoverResultSchema>;

type DateSignal = {
  source: "pdf-content" | "page-text" | "link-text" | "filename" | "url-path";
  raw: string;
  extracted: string | null;
};

type CollectResult = {
  pdfText: string;
  pdfPageCount: number;
  pageTitle: string;
  pageText: string;
  pdfUrl: string;
  filename: string;
  pdfLinksOnPage: number;
  expertPdfUrls: string[];
  pdfOverridden: boolean;
  allDateSignals: DateSignal[];
  errors: string[];
};

// ── Agents ──────────────────────────────────────────────────────────

const discoverAgent = new Agent({
  name: "discover",
  model: "gpt-5.4-mini",
  instructions: `You find official French court expert directory pages. Given a court name, search for its "experts judiciaires" page on official justice.fr sites. Find the page URL and the PDF link for the expert list.

Priority: cours-appel.justice.fr > ca-[city].justice.fr > courdecassation.fr. Never use exjudis.fr, cncej.org, or cejca-*.fr.

If your first search only returns legacy (ca-[city].justice.fr) URLs but no cours-appel.justice.fr result, do a second search specifically for the court on cours-appel.justice.fr before using the legacy URL.`,
  tools: [
    webSearchTool({
      userLocation: { type: "approximate", country: "FR", city: "Paris" },
      filters: {
        allowedDomains: [
          "cours-appel.justice.fr",
          "courdecassation.fr",
          "ca-papeete.justice.fr",
          "ca-besancon.justice.fr",
          "ca-noumea.justice.fr",
          "ca-cayenne.justice.fr",
          "ca-bastia.justice.fr",
        ],
      },
    }),
  ],
  outputType: discoverResultSchema,
  modelSettings: {
    reasoning: { effort: "medium" },
  },
});

const decideAgent = new Agent({
  name: "decide",
  model: "gpt-5.4-mini",
  instructions: `You decide the publication date for a French court expert directory.

Rules:
- Pick the most specific and most recent date
- A year-only date must never override an exact date from any other source
- If multiple exact dates exist, prefer pdf-content > page-text > link-text > filename > url-path
- Date format: YYYY-MM-DD
- The pre-parsed signals may be incomplete. Check the raw texts for any dates the parser missed — e.g. assembly dates ("assemblée générale du..."), decree dates ("arrêté du..."), or dates in unexpected formats.
- If you find a date in the raw text that wasn't in the pre-parsed signals, note it.`,
  outputType: expertFinderResultSchema,
  modelSettings: {
    reasoning: { effort: "low" },
  },
});

// ── Date parsing helpers (deterministic) ────────────────────────────

function extractFrenchDate(text: string): string | null {
  const m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function extractUrlPathDate(url: string): { raw: string; extracted: string | null } | null {
  const m = url.match(/\/(\d{4})-(\d{2})\//);
  if (m) return { raw: `/${m[1]}-${m[2]}/`, extracted: `${m[1]}-${m[2]}-01` };
  return null;
}

function extractFilenameDate(filename: string): { raw: string; extracted: string | null } | null {
  const frenchMonths: Record<string, string> = {
    janvier: "01", février: "02", fevrier: "02", mars: "03", avril: "04",
    mai: "05", juin: "06", juillet: "07", août: "08", aout: "08",
    septembre: "09", octobre: "10", novembre: "11", décembre: "12", decembre: "12",
  };

  const lower = filename.toLowerCase();
  for (const [month, num] of Object.entries(frenchMonths)) {
    const re = new RegExp(`(\\d{1,2})\\s+${month}\\s+(\\d{2,4})`, "i");
    const m = lower.match(re);
    if (m) {
      const year = m[2].length === 2 ? `20${m[2]}` : m[2];
      return { raw: m[0], extracted: `${year}-${num}-${m[1].padStart(2, "0")}` };
    }
  }

  const dm = filename.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dm) return { raw: dm[0], extracted: `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` };

  const iso = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (iso && parseInt(iso[2]) <= 12 && parseInt(iso[3]) <= 31) {
    return { raw: iso[0], extracted: `${iso[1]}-${iso[2]}-${iso[3]}` };
  }
  return null;
}

function extractPageTextDates(text: string): DateSignal[] {
  const signals: DateSignal[] = [];
  const patterns = text.match(
    /(?:mise à jour|MAJ|actualis[ée])[^.]{0,50}?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/gi
  );
  if (patterns) {
    for (const raw of patterns) {
      signals.push({ source: "page-text", raw, extracted: extractFrenchDate(raw) });
    }
  }
  return signals;
}

function extractPdfTextDates(text: string): DateSignal[] {
  const signals: DateSignal[] = [];

  const maj = text.match(/MAJ\s+LE?\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/gi);
  if (maj) for (const raw of maj) signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });

  const arretee = text.match(/arrêtée\s+(?:au|le)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/gi);
  if (arretee) for (const raw of arretee) signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });

  const maj2 = text.match(/mise\s+à\s+jour[^.]{0,30}?\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/gi);
  if (maj2) for (const raw of maj2) signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });

  const frenchMonths: Record<string, string> = {
    janvier: "01", février: "02", fevrier: "02", mars: "03", avril: "04",
    mai: "05", juin: "06", juillet: "07", août: "08", aout: "08",
    septembre: "09", octobre: "10", novembre: "11", décembre: "12", decembre: "12",
  };
  const monthPattern = Object.keys(frenchMonths).join("|");
  const re = new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})`, "gi");
  let match;
  while ((match = re.exec(text)) !== null) {
    const month = frenchMonths[match[2].toLowerCase()];
    if (month) signals.push({ source: "pdf-content", raw: match[0], extracted: `${match[3]}-${month}-${match[1].padStart(2, "0")}` });
  }
  return signals;
}

// ── Step 2: COLLECT (deterministic — no LLM) ───────────────────────

async function stepCollect(discover: DiscoverResult): Promise<CollectResult> {
  const errors: string[] = [];
  const allDateSignals: DateSignal[] = [];
  let pageTitle = "";
  let pageText = "";
  let pdfLinks: Array<{ url: string; text: string; relevanceHint: string }> = [];

  if (discover.pageUrl) {
    try {
      const resp = await fetch(discover.pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)" },
      });
      if (resp.ok) {
        const html = await resp.text();
        const $ = cheerio.load(html);
        pageTitle = $("title").text().trim() || $("h1").first().text().trim() || "";

        $('a[href*=".pdf"]').each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          let fullUrl: string;
          try { fullUrl = new URL(href, discover.pageUrl!).toString(); } catch { fullUrl = href; }
          const linkText = $(el).text().trim();
          const parentText = $(el).parent().text().trim().slice(0, 300);
          let fname: string;
          try { fname = decodeURIComponent(fullUrl.split("/").pop() || ""); } catch { fname = fullUrl.split("/").pop() || ""; }
          const lowerAll = (fullUrl + " " + linkText + " " + parentText + " " + fname).toLowerCase();
          let relevanceHint = "unknown";
          if (lowerAll.includes("expert") || lowerAll.includes("annuaire")) relevanceHint = "likely-expert-list";
          else if (lowerAll.includes("liste")) relevanceHint = "possible-expert-list";
          else if (lowerAll.includes("tarif") || lowerAll.includes("formulaire")) relevanceHint = "not-expert-list";
          pdfLinks.push({ url: fullUrl, text: linkText || parentText.slice(0, 100) || fname || "No text", relevanceHint });
          const linkDate = extractFrenchDate(linkText + " " + parentText);
          if (linkDate) allDateSignals.push({ source: "link-text", raw: linkText || parentText.slice(0, 100), extracted: linkDate });
        });

        $("script, style, nav, footer").remove();
        pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);
        allDateSignals.push(...extractPageTextDates(pageText));
      } else errors.push(`Page fetch failed: HTTP ${resp.status}`);
    } catch (e) { errors.push(`Page fetch error: ${e instanceof Error ? e.message : "unknown"}`); }
  }

  // Pick best PDF from page (override DISCOVER if newer found)
  let bestPdfUrl = discover.pdfUrl || "";
  const expertPdfs = pdfLinks.filter((p) => p.relevanceHint === "likely-expert-list");
  if (expertPdfs.length > 0) {
    let bestDate = "";
    for (const pdf of expertPdfs) {
      const pathDate = extractUrlPathDate(pdf.url);
      if (pathDate?.extracted && pathDate.extracted > bestDate) { bestDate = pathDate.extracted; bestPdfUrl = pdf.url; }
    }
    if (!bestDate) bestPdfUrl = expertPdfs[0].url;
  }
  const pdfOverridden = bestPdfUrl !== discover.pdfUrl;

  // Extract PDF text
  let pdfText = "";
  let pdfPageCount = 0;
  if (bestPdfUrl) {
    try {
      const resp = await fetch(bestPdfUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)" } });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        pdfPageCount = pdf.numPages;
        for (let i = 1; i <= Math.min(5, pdf.numPages); i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          pdfText += tc.items.map((item: any) => (item as { str?: string }).str || "").join(" ") + "\n\n";
        }
        pdfText = pdfText.replace(/\s+/g, " ").trim();
        allDateSignals.push(...extractPdfTextDates(pdfText));
      } else errors.push(`PDF fetch failed: HTTP ${resp.status}`);
    } catch (e) { errors.push(`PDF fetch error: ${e instanceof Error ? e.message : "unknown"}`); }
  }

  // URL path + filename signals
  const urlPathDate = extractUrlPathDate(bestPdfUrl);
  if (urlPathDate) allDateSignals.push({ source: "url-path", raw: urlPathDate.raw, extracted: urlPathDate.extracted });

  let filename = "";
  try { filename = decodeURIComponent(bestPdfUrl.split("/").pop() || ""); } catch { filename = bestPdfUrl.split("/").pop() || ""; }
  const filenameDate = extractFilenameDate(filename);
  if (filenameDate) allDateSignals.push({ source: "filename", raw: filenameDate.raw, extracted: filenameDate.extracted });

  return {
    pdfText: pdfText.slice(0, 1500), pdfPageCount, pageTitle,
    pageText: pageText.slice(0, 2000), pdfUrl: bestPdfUrl, filename,
    pdfLinksOnPage: pdfLinks.length,
    expertPdfUrls: expertPdfs.map((p) => p.url),
    pdfOverridden, allDateSignals, errors,
  };
}

// ── Build DECIDE prompt ─────────────────────────────────────────────

function buildDecidePrompt(court: string, discover: DiscoverResult, collect: CollectResult): string {
  const signalsList = collect.allDateSignals.length > 0
    ? collect.allDateSignals.map((s, i) => `${i + 1}. [${s.source}] "${s.raw}" → ${s.extracted || "could not parse"}`).join("\n")
    : "No date signals found.";

  return `Court: ${court}

Discovery:
- Page: ${discover.pageUrl || "not found"}
- PDF: ${collect.pdfUrl || "not found"}
- PDF title: ${discover.pdfTitle || "unknown"}

Pre-parsed date signals:
${signalsList}

Raw page text (first 2000 chars):
${collect.pageText || "not available"}

Raw PDF text (first 1500 chars):
${collect.pdfText || "not available"}

Pick the best date. If you find a date in the raw text that wasn't pre-parsed, note it.`;
}

// ── Pipeline ────────────────────────────────────────────────────────

export async function runCourtSearchAgents(court: string): Promise<{
  success: boolean;
  result: ExpertFinderResult | null;
  collect: CollectResult | null;
  error: string | null;
}> {
  return withTrace(`court-search-${court}`, async () => {
    // Step 1: DISCOVER
    const discoverRun = await run(
      discoverAgent,
      `Find the official experts judiciaires page and PDF for: Cour d'appel de ${court}`
    );
    const discover = discoverRun.finalOutput;

    // Checkpoint
    if (!discover.found || !discover.pdfUrl) {
      return {
        success: false,
        result: null,
        collect: null,
        error: `DISCOVER: not found. ${discover.searchExplanation}`,
      };
    }

    // Step 2: COLLECT (deterministic)
    const collect = await stepCollect(discover);

    // Step 3: DECIDE
    const decideRun = await run(
      decideAgent,
      buildDecidePrompt(court, discover, collect)
    );

    return {
      success: true,
      result: decideRun.finalOutput,
      collect,
      error: null,
    };
  });
}
