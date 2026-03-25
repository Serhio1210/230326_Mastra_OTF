/**
 * 3-Step Court Search Pipeline (Native OpenAI SDK)
 *
 * Step 1: DISCOVER — web_search with reasoning finds the page + PDF
 * Step 2: COLLECT  — deterministic parsing of all date signals (no LLM)
 * Step 3: DECIDE   — LLM with structured output picks the best date
 *
 * Each step has typed input/output and clear checkpoints.
 */
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import * as cheerio from "cheerio";
import {
  expertFinderResultSchema,
  type ExpertFinderResult,
} from "../mastra/schemas/expert-finder.ts";

const client = new OpenAI();

const JUSTICE_DOMAINS = [
  "cours-appel.justice.fr",
  "courdecassation.fr",
  "ca-papeete.justice.fr",
  "ca-besancon.justice.fr",
  "ca-noumea.justice.fr",
  "ca-cayenne.justice.fr",
  "ca-bastia.justice.fr",
];

// ── Step schemas ────────────────────────────────────────────────────

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
  allDateSignals: DateSignal[];
  errors: string[];
};

// ── Step 1: DISCOVER ────────────────────────────────────────────────

export type StepTrace = {
  name: string;
  startedAt: string;
  durationMs: number;
  input: any;
  output: any;
  usage?: { inputTokens: number; outputTokens: number };
  debug?: any;
};

async function stepDiscover(court: string): Promise<{ result: DiscoverResult; trace: StepTrace }> {
  const start = Date.now();

  const response = await client.responses.parse({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: `You find official French court expert directory pages. Given a court name, search for its "experts judiciaires" page on official justice.fr sites. Find the page URL and the PDF link for the expert list.

Priority: cours-appel.justice.fr > ca-[city].justice.fr > courdecassation.fr. Never use exjudis.fr, cncej.org, or cejca-*.fr.`,
      },
      {
        role: "user",
        content: `Find the official experts judiciaires page and PDF for: Cour d'appel de ${court}`,
      },
    ],
    tools: [
      {
        type: "web_search",
        user_location: { type: "approximate", country: "FR", city: "Paris" },
        filters: { allowed_domains: JUSTICE_DOMAINS },
      },
    ],
    text: {
      format: zodTextFormat(discoverResultSchema, "discover_result"),
    },
    reasoning: { effort: "medium" },
    include: ["web_search_call.results"],
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Step 1 DISCOVER: structured output returned null");

  // Extract web_search actions for debug trace
  const searchActions = response.output
    .filter((item): item is any => item.type === "web_search_call")
    .map((item) => ({
      id: item.id,
      action: item.action,
    }));

  return {
    result: parsed,
    trace: {
      name: "DISCOVER",
      startedAt: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      input: { court },
      output: parsed,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      debug: {
        outputItemTypes: response.output.map((i) => i.type),
        searchActions,
      },
    },
  };
}

// ── Step 2: COLLECT (deterministic — no LLM) ───────────────────────

// Date parsing helpers
function extractFrenchDate(text: string): string | null {
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function extractUrlPathDate(url: string): { raw: string; extracted: string | null } | null {
  // Match /YYYY-MM/ in URL path
  const m = url.match(/\/(\d{4})-(\d{2})\//);
  if (m) return { raw: `/${m[1]}-${m[2]}/`, extracted: `${m[1]}-${m[2]}-01` };
  return null;
}

function extractFilenameDate(filename: string): { raw: string; extracted: string | null } | null {
  // "MAJ 10 MARS 26" → 2026-03-10
  const frenchMonths: Record<string, string> = {
    janvier: "01", février: "02", fevrier: "02", mars: "03", avril: "04",
    mai: "05", juin: "06", juillet: "07", août: "08", aout: "08",
    septembre: "09", octobre: "10", novembre: "11", décembre: "12", decembre: "12",
  };

  const lower = filename.toLowerCase();

  // DD MONTH YY or DD MONTH YYYY
  for (const [month, num] of Object.entries(frenchMonths)) {
    const re = new RegExp(`(\\d{1,2})\\s+${month}\\s+(\\d{2,4})`, "i");
    const m = lower.match(re);
    if (m) {
      const year = m[2].length === 2 ? `20${m[2]}` : m[2];
      return { raw: m[0], extracted: `${year}-${num}-${m[1].padStart(2, "0")}` };
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY in filename
  const dm = filename.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dm) return { raw: dm[0], extracted: `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` };

  // DD.MM.YYYY or YYYYMMDD
  const iso = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (iso && parseInt(iso[2]) <= 12 && parseInt(iso[3]) <= 31) {
    return { raw: iso[0], extracted: `${iso[1]}-${iso[2]}-${iso[3]}` };
  }

  return null;
}

function extractPageTextDates(text: string): DateSignal[] {
  const signals: DateSignal[] = [];

  // "mise à jour : DD/MM/YYYY" or "MAJ DD/MM/YYYY" or "actualisé(e) DD/MM/YYYY"
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

  // "MAJ LE DD/MM/YYYY"
  const maj = text.match(/MAJ\s+LE?\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/gi);
  if (maj) {
    for (const raw of maj) {
      signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });
    }
  }

  // "arrêtée au DD/MM/YYYY" or "arrêtée le DD/MM/YYYY"
  const arretee = text.match(/arrêtée\s+(?:au|le)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/gi);
  if (arretee) {
    for (const raw of arretee) {
      signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });
    }
  }

  // "mise à jour" in PDF
  const maj2 = text.match(/mise\s+à\s+jour[^.]{0,30}?\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/gi);
  if (maj2) {
    for (const raw of maj2) {
      signals.push({ source: "pdf-content", raw, extracted: extractFrenchDate(raw) });
    }
  }

  // French written dates: "18 novembre 2025", "4 mars 2026"
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
    if (month) {
      signals.push({
        source: "pdf-content",
        raw: match[0],
        extracted: `${match[3]}-${month}-${match[1].padStart(2, "0")}`,
      });
    }
  }

  return signals;
}

async function stepCollect(
  discover: DiscoverResult
): Promise<{ result: CollectResult; trace: StepTrace }> {
  const start = Date.now();
  const errors: string[] = [];
  const allDateSignals: DateSignal[] = [];

  // Fetch the page with cheerio (if we have a page URL)
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

        // Extract all PDF links from the page
        $('a[href*=".pdf"]').each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;

          let fullUrl: string;
          try { fullUrl = new URL(href, discover.pageUrl!).toString(); } catch { fullUrl = href; }

          const linkText = $(el).text().trim();
          const parentText = $(el).parent().text().trim().slice(0, 300);

          let fname: string;
          try { fname = decodeURIComponent(fullUrl.split("/").pop() || ""); } catch { fname = fullUrl.split("/").pop() || ""; }

          const lowerUrl = fullUrl.toLowerCase();
          const lowerText = (linkText + " " + parentText + " " + fname).toLowerCase();
          let relevanceHint = "unknown";

          if (lowerUrl.includes("expert") || lowerText.includes("expert") || lowerUrl.includes("annuaire") || lowerText.includes("annuaire")) {
            relevanceHint = "likely-expert-list";
          } else if (lowerUrl.includes("liste") || lowerText.includes("liste")) {
            relevanceHint = "possible-expert-list";
          } else if (lowerUrl.includes("tarif") || lowerUrl.includes("formulaire") || lowerText.includes("tarif") || lowerText.includes("formulaire")) {
            relevanceHint = "not-expert-list";
          }

          pdfLinks.push({
            url: fullUrl,
            text: linkText || parentText.slice(0, 100) || fname || "No text",
            relevanceHint,
          });

          // Extract date signals from link text
          const linkDate = extractFrenchDate(linkText + " " + parentText);
          if (linkDate) {
            allDateSignals.push({ source: "link-text", raw: linkText || parentText.slice(0, 100), extracted: linkDate });
          }
        });

        $("script, style, nav, footer").remove();
        pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);

        // Extract page-text date signals
        allDateSignals.push(...extractPageTextDates(pageText));
      } else {
        errors.push(`Page fetch failed: HTTP ${resp.status}`);
      }
    } catch (e) {
      errors.push(`Page fetch error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Pick the best PDF: prefer the most recent expert-list PDF from the page
  // DISCOVER may have found an older PDF — the page has the real list
  let bestPdfUrl = discover.pdfUrl || "";

  const expertPdfs = pdfLinks.filter((p) => p.relevanceHint === "likely-expert-list");
  if (expertPdfs.length > 0) {
    // Pick the one with the most recent URL path date, or the first one
    let bestDate = "";
    for (const pdf of expertPdfs) {
      const pathDate = extractUrlPathDate(pdf.url);
      if (pathDate?.extracted && pathDate.extracted > bestDate) {
        bestDate = pathDate.extracted;
        bestPdfUrl = pdf.url;
      }
    }
    // If no path date found, just use the first expert PDF
    if (!bestDate && expertPdfs.length > 0) {
      bestPdfUrl = expertPdfs[0].url;
    }
  }

  // Extract PDF text using the best PDF URL
  let pdfText = "";
  let pdfPageCount = 0;
  if (bestPdfUrl) {
    try {
      const resp = await fetch(bestPdfUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ExpertFinderBot/1.0)" },
      });
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

        // Extract pdf-content date signals
        allDateSignals.push(...extractPdfTextDates(pdfText));
      } else {
        errors.push(`PDF fetch failed: HTTP ${resp.status}`);
      }
    } catch (e) {
      errors.push(`PDF fetch error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Extract URL path date from the best PDF URL
  const pdfUrl = bestPdfUrl;
  const urlPathDate = extractUrlPathDate(pdfUrl);
  if (urlPathDate) {
    allDateSignals.push({ source: "url-path", raw: urlPathDate.raw, extracted: urlPathDate.extracted });
  }

  // Extract filename date
  let filename = "";
  try {
    filename = decodeURIComponent(pdfUrl.split("/").pop() || "");
  } catch {
    filename = pdfUrl.split("/").pop() || "";
  }
  const filenameDate = extractFilenameDate(filename);
  if (filenameDate) {
    allDateSignals.push({ source: "filename", raw: filenameDate.raw, extracted: filenameDate.extracted });
  }

  const result: CollectResult = {
    pdfText: pdfText.slice(0, 1500),
    pdfPageCount,
    pageTitle,
    pageText: pageText.slice(0, 2000),
    pdfUrl,
    filename,
    allDateSignals,
    errors,
  };

  const pdfOverridden = bestPdfUrl !== discover.pdfUrl;

  return {
    result,
    trace: {
      name: "COLLECT",
      startedAt: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      input: { pageUrl: discover.pageUrl, pdfUrl: discover.pdfUrl },
      output: {
        pageTitle,
        filename,
        pdfPageCount,
        pdfOverridden,
        discoverPdfUrl: discover.pdfUrl,
        bestPdfUrl: pdfOverridden ? bestPdfUrl : undefined,
        pdfLinksOnPage: pdfLinks.length,
        expertPdfs: pdfLinks.filter((p) => p.relevanceHint === "likely-expert-list").map((p) => p.url),
        signalCount: allDateSignals.length,
        signals: allDateSignals,
        errors,
      },
    },
  };
}

// ── Step 3: DECIDE (LLM — no tools) ────────────────────────────────

async function stepDecide(
  court: string,
  discover: DiscoverResult,
  collect: CollectResult
): Promise<{ result: ExpertFinderResult; trace: StepTrace }> {
  const start = Date.now();

  const signalsList = collect.allDateSignals.length > 0
    ? collect.allDateSignals
        .map((s, i) => `${i + 1}. [${s.source}] "${s.raw}" → ${s.extracted || "could not parse"}`)
        .join("\n")
    : "No date signals found.";

  const prompt = `You are deciding the publication date for a French court expert directory.

## Court: ${court}

## Discovery
- Page: ${discover.pageUrl || "not found"}
- PDF: ${discover.pdfUrl || "not found"}
- PDF title: ${discover.pdfTitle || "unknown"}

## Pre-parsed date signals (extracted by regex)
${signalsList}

## Rules
- Pick the most specific and most recent date
- A year-only date must never override an exact date from any other source
- If multiple exact dates exist, prefer pdf-content > page-text > link-text > filename > url-path
- Date format: YYYY-MM-DD
- **Important**: The pre-parsed signals above may be incomplete. Check the raw texts below for any dates the parser missed — e.g. assembly dates ("assemblée générale du..."), decree dates ("arrêté du..."), or dates in unexpected formats.

## Raw page text (first 2000 chars)
${collect.pageText || "not available"}

## Raw PDF text (first 1500 chars)
${collect.pdfText || "not available"}

Pick the best date. If you find a date in the raw text that wasn't in the pre-parsed signals, note it. Explain your reasoning.`;

  const response = await client.responses.parse({
    model: "gpt-5.4-mini",
    input: [{ role: "user", content: prompt }],
    text: {
      format: zodTextFormat(expertFinderResultSchema, "expert_finder_result"),
    },
    reasoning: { effort: "low" },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Step 3 DECIDE: structured output returned null");

  return {
    result: parsed,
    trace: {
      name: "DECIDE",
      startedAt: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      input: { court, signalCount: collect.allDateSignals.length, signals: collect.allDateSignals },
      output: parsed,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      debug: { prompt },
    },
  };
}

// ── Pipeline orchestrator ───────────────────────────────────────────

export type PipelineTrace = {
  court: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  success: boolean;
  result: ExpertFinderResult | null;
  steps: StepTrace[];
  error: string | null;
};

export async function runCourtSearch3Step(court: string): Promise<PipelineTrace> {
  const totalStart = Date.now();
  const steps: StepTrace[] = [];

  try {
    // Step 1: DISCOVER
    const { result: discover, trace: t1 } = await stepDiscover(court);
    steps.push(t1);

    // Checkpoint: found?
    if (!discover.found || !discover.pdfUrl) {
      return {
        court,
        startedAt: new Date(totalStart).toISOString(),
        finishedAt: new Date().toISOString(),
        totalMs: Date.now() - totalStart,
        success: false,
        result: null,
        steps,
        error: `DISCOVER: page/PDF not found. ${discover.searchExplanation}`,
      };
    }

    // Step 2: COLLECT
    const { result: collect, trace: t2 } = await stepCollect(discover);
    steps.push(t2);

    // Step 3: DECIDE
    const { result: decide, trace: t3 } = await stepDecide(court, discover, collect);
    steps.push(t3);

    return {
      court,
      startedAt: new Date(totalStart).toISOString(),
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - totalStart,
      success: true,
      result: decide,
      steps,
      error: null,
    };
  } catch (error) {
    return {
      court,
      startedAt: new Date(totalStart).toISOString(),
      finishedAt: new Date().toISOString(),
      totalMs: Date.now() - totalStart,
      success: false,
      result: null,
      steps,
      error: error instanceof Error ? `${error.message}\n${error.stack}` : "Unknown error",
    };
  }
}
