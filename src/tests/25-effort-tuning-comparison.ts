/**
 * Test 25: Effort tuning comparison
 *
 * Mini: agent=medium, extraction=high
 * Full: agent=low, extraction=low (hypothesis: full was overthinking)
 *
 * Both use allowed_domains filter.
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

function calcCost(model: string, inTok: number, outTok: number): number {
  if (model.includes("mini")) return (inTok * 0.075 + outTok * 4.5) / 1_000_000;
  return (inTok * 1.0 + outTok * 8.0) / 1_000_000;
}

function fmt(ms: number): string { return `${(ms / 1000).toFixed(1)}s`; }

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
  console.log("║  Test 25: Effort Tuning — Mini med/high vs Full lo/lo║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Mini: gpt-5.4-mini, agent=medium, extraction=high`);
  console.log(`Full: gpt-5.4, agent=low, extraction=low`);
  console.log(`Both use allowed_domains filter`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: Array<{ court: string; mini: AgentTrace; full: AgentTrace }> = [];

  for (const court of TEST_COURTS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${court}`);
    console.log("─".repeat(60));

    console.log(`  [Mini med/high] Starting...`);
    const mini = await runCourtSearchNative(court, {
      model: "gpt-5.4-mini",
      effort: "medium",
      extractionEffort: "high",
      allowedDomains: JUSTICE_DOMAINS,
    });
    const mDate = mini.result?.publicationDate || (mini.error ? "ERR" : "null");
    console.log(`  [Mini] ${mDate} (${mini.result?.publicationDateSource || "-"}) ${fmt(mini.totalMs)}`);

    console.log(`  [Full low/low] Starting...`);
    const full = await runCourtSearchNative(court, {
      model: "gpt-5.4",
      effort: "low",
      extractionEffort: "low",
      allowedDomains: JUSTICE_DOMAINS,
    });
    const fDate = full.result?.publicationDate || (full.error ? "ERR" : "null");
    console.log(`  [Full] ${fDate} (${full.result?.publicationDateSource || "-"}) ${fmt(full.totalMs)}`);

    results.push({ court, mini, full });
  }

  // ── Summary table ─────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(140)}`);
  console.log("EFFORT TUNING: Mini (med/high) vs Full (low/low)");
  console.log("═".repeat(140));

  const header = [
    "Court".padEnd(18),
    "Mini Date".padEnd(14),
    "Full Date".padEnd(14),
    "Match".padEnd(7),
    "Mini Src".padEnd(13),
    "Full Src".padEnd(13),
    "Mini Time".padEnd(10),
    "Full Time".padEnd(10),
    "Mini Turns".padEnd(11),
    "Full Turns".padEnd(11),
    "Mini Cost".padEnd(10),
    "Full Cost",
  ].join("│");
  console.log(header);
  console.log("─".repeat(140));

  let matchCount = 0;
  let totalMiniCost = 0, totalFullCost = 0;
  let totalMiniMs = 0, totalFullMs = 0;

  for (const { court, mini, full } of results) {
    const mDate = mini.result?.publicationDate || (mini.error ? "ERR" : "null");
    const fDate = full.result?.publicationDate || (full.error ? "ERR" : "null");
    const match = mDate === fDate ? " ✓" : " ✗";
    if (mDate === fDate) matchCount++;

    const mCost = calcCost("mini", mini.totalUsage.inputTokens, mini.totalUsage.outputTokens);
    const fCost = calcCost("full", full.totalUsage.inputTokens, full.totalUsage.outputTokens);
    totalMiniCost += mCost; totalFullCost += fCost;
    totalMiniMs += mini.totalMs; totalFullMs += full.totalMs;

    console.log([
      court.padEnd(18),
      mDate.padEnd(14),
      fDate.padEnd(14),
      match.padEnd(7),
      (mini.result?.publicationDateSource || "-").padEnd(13),
      (full.result?.publicationDateSource || "-").padEnd(13),
      fmt(mini.totalMs).padEnd(10),
      fmt(full.totalMs).padEnd(10),
      String(mini.steps.length).padEnd(11),
      String(full.steps.length).padEnd(11),
      `$${mCost.toFixed(3)}`.padEnd(10),
      `$${fCost.toFixed(3)}`,
    ].join("│"));
  }

  console.log("─".repeat(140));
  console.log(`\nAgreement: ${matchCount}/${results.length}`);
  console.log(`Cost:  Mini $${totalMiniCost.toFixed(4)} | Full $${totalFullCost.toFixed(4)} (${(totalFullCost / totalMiniCost).toFixed(1)}x)`);
  console.log(`Time:  Mini ${fmt(totalMiniMs)} | Full ${fmt(totalFullMs)}`);

  // ── Divergences ───────────────────────────────────────────────────
  const divergent = results.filter(r => r.mini.result?.publicationDate !== r.full.result?.publicationDate);
  if (divergent.length > 0) {
    console.log(`\n${"═".repeat(90)}`);
    console.log(`DIVERGENT COURTS (${divergent.length})`);
    console.log("═".repeat(90));
    for (const { court, mini, full } of divergent) {
      console.log(`\n── ${court} ──`);
      console.log(`  Mini: ${mini.result?.publicationDate} (${mini.result?.publicationDateSource})`);
      console.log(`  Full: ${full.result?.publicationDate} (${full.result?.publicationDateSource})`);
      console.log(`  Mini reason: ${mini.result?.dateExtractionExplanation?.slice(0, 250)}`);
      console.log(`  Full reason: ${full.result?.dateExtractionExplanation?.slice(0, 250)}`);
      console.log(`  Mini path: ${traceTools(mini)}`);
      console.log(`  Full path: ${traceTools(full)}`);
      if (mini.error) console.log(`  Mini error: ${mini.error.slice(0, 200)}`);
      if (full.error) console.log(`  Full error: ${full.error.slice(0, 200)}`);
    }
  }

  // ── Errors ────────────────────────────────────────────────────────
  const errors = results.filter(r => r.mini.error || r.full.error);
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
  const path = `docs/archive/effort-tuning-${timestamp}.json`;
  const data = results.map(({ court, mini, full }) => ({
    court,
    datesMatch: mini.result?.publicationDate === full.result?.publicationDate,
    mini: {
      config: { model: "gpt-5.4-mini", agentEffort: "medium", extractionEffort: "high" },
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
      config: { model: "gpt-5.4", agentEffort: "low", extractionEffort: "low" },
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
