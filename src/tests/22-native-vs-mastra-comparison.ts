/**
 * Test 22: Native OpenAI SDK vs Mastra+AI SDK comparison
 *
 * Runs both implementations on 10 courts and compares:
 * - Dates found and date sources
 * - Timing (agent step, extraction step)
 * - Token usage / cost
 * - Agent behavior (turns, tool calls)
 * - Errors
 *
 * Saves full native traces + comparison summary to docs/archive/
 */
import { runCourtSearchMini } from "../lib/run-court-search-mini.ts";
import { runCourtSearchNative, type AgentTrace } from "../lib/run-court-search-native.ts";
import type { CourtSearchResult } from "../lib/run-court-search.ts";

// ── Courts to compare ───────────────────────────────────────────────
const COMPARISON_COURTS = [
  "Paris",           // high-traffic, should be easy
  "Lyon",            // divergent: Sonnet wrong, Mini correct
  "Angers",          // divergent: two valid dates
  "Besançon",        // divergent: wrong site problem
  "Bordeaux",        // divergent: old PDF problem
  "Amiens",          // divergent: old PDF problem
  "Aix-en-Provence", // known-good, big court
  "Rennes",          // known-good
  "Cayenne",         // AI SDK bug — does native SDK handle it?
  "Grenoble",        // known-good
];

// ── Cost calculation (GPT-5.4 Mini) ─────────────────────────────────
function calcCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.075 + outputTokens * 4.5) / 1_000_000;
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Run one court on both implementations ───────────────────────────
async function compareCourt(court: string): Promise<{
  court: string;
  mastra: CourtSearchResult;
  native: AgentTrace;
}> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${court}`);
  console.log("─".repeat(60));

  console.log(`  [Mastra] Starting...`);
  const mastra = await runCourtSearchMini(court, "none");
  console.log(`  [Mastra] ${mastra.success ? "✓" : "✗"} ${fmt(mastra.timing.totalMs)} — ${mastra.result?.publicationDate || mastra.error?.slice(0, 80)}`);

  console.log(`  [Native] Starting...`);
  const native = await runCourtSearchNative(court, "none");
  console.log(`  [Native] ${native.result ? "✓" : "✗"} ${fmt(native.totalMs)} — ${native.result?.publicationDate || native.error?.slice(0, 80)}`);

  return { court, mastra, native };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const runStart = new Date();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Test 22: Native OpenAI SDK vs Mastra Comparison    ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Courts: ${COMPARISON_COURTS.length}`);
  console.log(`Model: gpt-5.4-mini (both)`);
  console.log(`Agent effort: none | Extraction effort: medium`);
  console.log(`Started: ${runStart.toISOString()}`);

  const results: Array<{ court: string; mastra: CourtSearchResult; native: AgentTrace }> = [];

  for (const court of COMPARISON_COURTS) {
    try {
      results.push(await compareCourt(court));
    } catch (error) {
      console.error(`  FATAL on ${court}:`, error);
    }
  }

  // ── Summary table ─────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(130)}`);
  console.log("COMPARISON RESULTS");
  console.log("═".repeat(130));

  const header = [
    "Court".padEnd(18),
    "Mastra Date".padEnd(14),
    "Native Date".padEnd(14),
    "Match".padEnd(7),
    "M-Src".padEnd(13),
    "N-Src".padEnd(13),
    "M-Time".padEnd(9),
    "N-Time".padEnd(9),
    "N-Turns".padEnd(9),
    "M-Cost".padEnd(9),
    "N-Cost",
  ].join("│");
  console.log(header);
  console.log("─".repeat(130));

  let matchCount = 0;
  let totalMastraCost = 0;
  let totalNativeCost = 0;
  let totalMastraMs = 0;
  let totalNativeMs = 0;

  for (const { court, mastra, native } of results) {
    const mDate = mastra.result?.publicationDate || (mastra.error ? "ERR" : "null");
    const nDate = native.result?.publicationDate || (native.error ? "ERR" : "null");
    const match = mDate === nDate ? " ✓" : " ✗";
    if (mDate === nDate) matchCount++;

    const mSrc = mastra.result?.publicationDateSource || "-";
    const nSrc = native.result?.publicationDateSource || "-";

    const mCost = calcCost(mastra.usage.total.inputTokens, mastra.usage.total.outputTokens);
    const nCost = calcCost(native.totalUsage.inputTokens, native.totalUsage.outputTokens);
    totalMastraCost += mCost;
    totalNativeCost += nCost;
    totalMastraMs += mastra.timing.totalMs;
    totalNativeMs += native.totalMs;

    const nTurns = native.steps.length;

    console.log([
      court.padEnd(18),
      mDate.padEnd(14),
      nDate.padEnd(14),
      match.padEnd(7),
      mSrc.padEnd(13),
      nSrc.padEnd(13),
      fmt(mastra.timing.totalMs).padEnd(9),
      fmt(native.totalMs).padEnd(9),
      String(nTurns).padEnd(9),
      `$${mCost.toFixed(3)}`.padEnd(9),
      `$${nCost.toFixed(3)}`,
    ].join("│"));
  }

  console.log("─".repeat(130));
  console.log(`\nDate agreement: ${matchCount}/${results.length}`);
  console.log(`Total cost:  Mastra $${totalMastraCost.toFixed(4)} | Native $${totalNativeCost.toFixed(4)} (${totalNativeCost < totalMastraCost ? "native cheaper" : "mastra cheaper"} by ${Math.abs(((totalNativeCost / totalMastraCost - 1) * 100)).toFixed(0)}%)`);
  console.log(`Total time:  Mastra ${fmt(totalMastraMs)} | Native ${fmt(totalNativeMs)} (${totalNativeMs < totalMastraMs ? "native faster" : "mastra faster"} by ${Math.abs(((totalNativeMs / totalMastraMs - 1) * 100)).toFixed(0)}%)`);

  // ── Divergences ───────────────────────────────────────────────────
  const divergent = results.filter(
    (r) => r.mastra.result?.publicationDate !== r.native.result?.publicationDate
  );
  if (divergent.length > 0) {
    console.log(`\n${"═".repeat(90)}`);
    console.log("DIVERGENT COURTS");
    console.log("═".repeat(90));
    for (const { court, mastra, native } of divergent) {
      console.log(`\n── ${court} ──`);
      console.log(`  Mastra: ${mastra.result?.publicationDate} (${mastra.result?.publicationDateSource})`);
      console.log(`  Native: ${native.result?.publicationDate} (${native.result?.publicationDateSource})`);
      console.log(`  Mastra reason: ${mastra.result?.dateExtractionExplanation?.slice(0, 250)}`);
      console.log(`  Native reason: ${native.result?.dateExtractionExplanation?.slice(0, 250)}`);
      if (mastra.error) console.log(`  Mastra error: ${mastra.error.slice(0, 200)}`);
      if (native.error) console.log(`  Native error: ${native.error.slice(0, 200)}`);

      // Show native agent trace for divergent courts
      console.log(`  Native trace (${native.steps.length} turns):`);
      for (const step of native.steps) {
        const toolCalls = step.events.filter((e) => e.type === "function_call" || e.type === "web_search");
        const desc = toolCalls.map((e) => {
          if (e.type === "web_search") return "web_search";
          if (e.type === "function_call") return `${e.name}(${JSON.stringify(e.arguments).slice(0, 80)})`;
          return e.type;
        }).join(", ");
        console.log(`    Turn ${step.turn}: [${step.outputItemTypes.join(",")}] ${desc || "(final text)"}`);
      }
    }
  }

  // ── Errors ────────────────────────────────────────────────────────
  const errors = results.filter((r) => r.mastra.error || r.native.error);
  if (errors.length > 0) {
    console.log(`\n${"═".repeat(90)}`);
    console.log("ERRORS");
    console.log("═".repeat(90));
    for (const { court, mastra, native } of errors) {
      if (mastra.error) console.log(`  [Mastra] ${court}: ${mastra.error.slice(0, 300)}`);
      if (native.error) console.log(`  [Native] ${court}: ${native.error.slice(0, 300)}`);
    }
  }

  // ── Save everything ───────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // 1. Save comparison summary
  const summaryPath = `docs/archive/comparison-summary-${timestamp}.json`;
  const summary = results.map(({ court, mastra, native }) => ({
    court,
    datesMatch: mastra.result?.publicationDate === native.result?.publicationDate,
    mastra: {
      date: mastra.result?.publicationDate ?? null,
      source: mastra.result?.publicationDateSource ?? null,
      pageUrl: mastra.result?.pageUrl ?? null,
      pdfUrl: mastra.result?.documentUrl ?? null,
      timing: mastra.timing,
      tokens: mastra.usage.total,
      cost: calcCost(mastra.usage.total.inputTokens, mastra.usage.total.outputTokens),
      error: mastra.error,
      dateExplanation: mastra.result?.dateExtractionExplanation ?? null,
      searchExplanation: mastra.result?.searchExplanation ?? null,
    },
    native: {
      date: native.result?.publicationDate ?? null,
      source: native.result?.publicationDateSource ?? null,
      pageUrl: native.result?.pageUrl ?? null,
      pdfUrl: native.result?.documentUrl ?? null,
      timing: { agentMs: native.totalMs - (native.extraction?.durationMs ?? 0), extractionMs: native.extraction?.durationMs ?? 0, totalMs: native.totalMs },
      tokens: native.totalUsage,
      cost: calcCost(native.totalUsage.inputTokens, native.totalUsage.outputTokens),
      turns: native.steps.length,
      error: native.error,
      dateExplanation: native.result?.dateExtractionExplanation ?? null,
      searchExplanation: native.result?.searchExplanation ?? null,
    },
  }));
  await Bun.write(summaryPath, JSON.stringify(summary, null, 2));

  // 2. Save full native traces (one file per court)
  for (const { court, native } of results) {
    const courtSlug = court.toLowerCase().replace(/[^a-z]/g, "");
    const tracePath = `docs/archive/trace-${courtSlug}-${timestamp}.json`;
    // Trim large text fields for reasonable file sizes
    const trimmed = {
      ...native,
      steps: native.steps.map((s) => ({
        ...s,
        events: s.events.map((e) => {
          if (e.type === "function_result" && e.fullResult) {
            return { ...e, fullResult: { ...e.fullResult, pageText: e.fullResult.pageText?.slice(0, 2000), pdfText: e.fullResult.pdfText?.slice(0, 1500) } };
          }
          return e;
        }),
      })),
    };
    await Bun.write(tracePath, JSON.stringify(trimmed, null, 2));
  }

  console.log(`\nSaved:`);
  console.log(`  Comparison: ${summaryPath}`);
  console.log(`  Traces: docs/archive/trace-{court}-${timestamp}.json (${results.length} files)`);
  console.log(`\nFinished: ${new Date().toISOString()} (${fmt(Date.now() - runStart.getTime())} total)`);
}

main().catch(console.error);
