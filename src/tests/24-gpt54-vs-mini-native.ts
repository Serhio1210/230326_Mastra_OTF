/**
 * Test 24: GPT-5.4 (full, low effort) vs GPT-5.4 Mini — native SDK
 *
 * Both use allowed_domains filter + updated instructions.
 * GPT-5.4 full with low reasoning effort vs Mini with no reasoning.
 *
 * Usage: bun src/tests/24-gpt54-vs-mini-native.ts
 */
import { runCourtSearchNative, type AgentTrace } from "../lib/run-court-search-native.ts";

const JUSTICE_DOMAINS = [
  "cours-appel.justice.fr",
  "courdecassation.fr",
  "ca-papeete.justice.fr",
  "ca-besancon.justice.fr",
  "ca-noumea.justice.fr",
  "ca-cayenne.justice.fr",
  "ca-bastia.justice.fr",
];

const TEST_COURTS = [
  "Paris",
  "Lyon",
  "Angers",
  "Besançon",
  "Bordeaux",
  "Amiens",
  "Aix-en-Provence",
  "Rennes",
  "Cayenne",
  "Grenoble",
];

// GPT-5.4 Mini: $0.075/1M in, $4.50/1M out (estimated — reasoning tokens may differ)
// GPT-5.4:     $1.00/1M in,  $8.00/1M out (estimated)
function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  if (model.includes("mini")) {
    return (inputTokens * 0.075 + outputTokens * 4.5) / 1_000_000;
  }
  // GPT-5.4 full pricing (estimate — check actual pricing)
  return (inputTokens * 1.0 + outputTokens * 8.0) / 1_000_000;
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function traceTools(trace: AgentTrace): string {
  return trace.steps.map((s) => {
    const calls = s.events
      .filter((e) => e.type === "function_call" || e.type === "web_search")
      .map((e) => {
        if (e.type === "web_search") return "🔍";
        if (e.type === "function_call") {
          const domain = e.arguments?.url?.match(/https?:\/\/([^/]+)/)?.[1] || "";
          return `${e.name}(${domain.slice(0, 30)})`;
        }
        return "";
      });
    return calls.length > 0 ? calls.join(", ") : "💬";
  }).join(" → ");
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Test 24: GPT-5.4 low vs Mini — Native SDK          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Courts: ${TEST_COURTS.length}`);
  console.log(`Mini: gpt-5.4-mini, effort=none, extraction=medium`);
  console.log(`Full: gpt-5.4, effort=low, extraction=medium`);
  console.log(`Both use allowed_domains filter`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: Array<{ court: string; mini: AgentTrace; full: AgentTrace }> = [];

  for (const court of TEST_COURTS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${court}`);
    console.log("─".repeat(60));

    console.log(`  [Mini] Starting...`);
    const mini = await runCourtSearchNative(court, {
      model: "gpt-5.4-mini",
      effort: "none",
      extractionEffort: "medium",
      allowedDomains: JUSTICE_DOMAINS,
    });
    const miniDate = mini.result?.publicationDate || (mini.error ? "ERR" : "null");
    console.log(`  [Mini] ${miniDate} (${mini.result?.publicationDateSource || "-"}) ${fmt(mini.totalMs)}`);

    console.log(`  [Full] Starting...`);
    const full = await runCourtSearchNative(court, {
      model: "gpt-5.4",
      effort: "low",
      extractionEffort: "medium",
      allowedDomains: JUSTICE_DOMAINS,
    });
    const fullDate = full.result?.publicationDate || (full.error ? "ERR" : "null");
    console.log(`  [Full] ${fullDate} (${full.result?.publicationDateSource || "-"}) ${fmt(full.totalMs)}`);

    results.push({ court, mini, full });
  }

  // ── Summary table ─────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(130)}`);
  console.log("GPT-5.4 FULL (low) vs MINI — COMPARISON");
  console.log("═".repeat(130));

  const header = [
    "Court".padEnd(18),
    "Mini Date".padEnd(14),
    "Full Date".padEnd(14),
    "Match".padEnd(7),
    "Mini Src".padEnd(13),
    "Full Src".padEnd(13),
    "Mini Time".padEnd(10),
    "Full Time".padEnd(10),
    "Mini Cost".padEnd(10),
    "Full Cost",
  ].join("│");
  console.log(header);
  console.log("─".repeat(130));

  let matchCount = 0;
  let totalMiniCost = 0;
  let totalFullCost = 0;
  let totalMiniMs = 0;
  let totalFullMs = 0;

  for (const { court, mini, full } of results) {
    const mDate = mini.result?.publicationDate || (mini.error ? "ERR" : "null");
    const fDate = full.result?.publicationDate || (full.error ? "ERR" : "null");
    const match = mDate === fDate ? " ✓" : " ✗";
    if (mDate === fDate) matchCount++;

    const mCost = calcCost("mini", mini.totalUsage.inputTokens, mini.totalUsage.outputTokens);
    const fCost = calcCost("full", full.totalUsage.inputTokens, full.totalUsage.outputTokens);
    totalMiniCost += mCost;
    totalFullCost += fCost;
    totalMiniMs += mini.totalMs;
    totalFullMs += full.totalMs;

    console.log([
      court.padEnd(18),
      mDate.padEnd(14),
      fDate.padEnd(14),
      match.padEnd(7),
      (mini.result?.publicationDateSource || "-").padEnd(13),
      (full.result?.publicationDateSource || "-").padEnd(13),
      fmt(mini.totalMs).padEnd(10),
      fmt(full.totalMs).padEnd(10),
      `$${mCost.toFixed(3)}`.padEnd(10),
      `$${fCost.toFixed(3)}`,
    ].join("│"));
  }

  console.log("─".repeat(130));
  console.log(`\nAgreement: ${matchCount}/${results.length}`);
  console.log(`Total cost:  Mini $${totalMiniCost.toFixed(4)} | Full $${totalFullCost.toFixed(4)} (full is ${(totalFullCost / totalMiniCost).toFixed(1)}x more expensive)`);
  console.log(`Total time:  Mini ${fmt(totalMiniMs)} | Full ${fmt(totalFullMs)}`);

  // ── Divergences ───────────────────────────────────────────────────
  const divergent = results.filter(
    (r) => r.mini.result?.publicationDate !== r.full.result?.publicationDate
  );
  if (divergent.length > 0) {
    console.log(`\n${"═".repeat(90)}`);
    console.log(`DIVERGENT COURTS (${divergent.length})`);
    console.log("═".repeat(90));
    for (const { court, mini, full } of divergent) {
      console.log(`\n── ${court} ──`);
      console.log(`  Mini: ${mini.result?.publicationDate} (${mini.result?.publicationDateSource})`);
      console.log(`  Full: ${full.result?.publicationDate} (${full.result?.publicationDateSource})`);
      console.log(`  Mini reason: ${mini.result?.dateExtractionExplanation?.slice(0, 200)}`);
      console.log(`  Full reason: ${full.result?.dateExtractionExplanation?.slice(0, 200)}`);
      console.log(`  Mini path: ${traceTools(mini)}`);
      console.log(`  Full path: ${traceTools(full)}`);
      if (mini.error) console.log(`  Mini error: ${mini.error.slice(0, 200)}`);
      if (full.error) console.log(`  Full error: ${full.error.slice(0, 200)}`);
    }
  }

  // ── Errors ────────────────────────────────────────────────────────
  const errors = results.filter((r) => r.mini.error || r.full.error);
  if (errors.length > 0) {
    console.log(`\n${"═".repeat(90)}`);
    console.log("ERRORS");
    console.log("═".repeat(90));
    for (const { court, mini, full } of errors) {
      if (mini.error) console.log(`  [Mini] ${court}: ${mini.error.slice(0, 300)}`);
      if (full.error) console.log(`  [Full] ${court}: ${full.error.slice(0, 300)}`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `docs/archive/gpt54-vs-mini-native-${timestamp}.json`;
  const data = results.map(({ court, mini, full }) => ({
    court,
    datesMatch: mini.result?.publicationDate === full.result?.publicationDate,
    mini: {
      date: mini.result?.publicationDate ?? null,
      source: mini.result?.publicationDateSource ?? null,
      pageUrl: mini.result?.pageUrl ?? null,
      pdfUrl: mini.result?.documentUrl ?? null,
      turns: mini.steps.length,
      totalMs: mini.totalMs,
      tokens: mini.totalUsage,
      cost: calcCost("mini", mini.totalUsage.inputTokens, mini.totalUsage.outputTokens),
      error: mini.error,
      dateExplanation: mini.result?.dateExtractionExplanation ?? null,
    },
    full: {
      date: full.result?.publicationDate ?? null,
      source: full.result?.publicationDateSource ?? null,
      pageUrl: full.result?.pageUrl ?? null,
      pdfUrl: full.result?.documentUrl ?? null,
      turns: full.steps.length,
      totalMs: full.totalMs,
      tokens: full.totalUsage,
      cost: calcCost("full", full.totalUsage.inputTokens, full.totalUsage.outputTokens),
      error: full.error,
      dateExplanation: full.result?.dateExtractionExplanation ?? null,
    },
  }));
  await Bun.write(path, JSON.stringify(data, null, 2));
  console.log(`\nSaved: ${path}`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(console.error);
