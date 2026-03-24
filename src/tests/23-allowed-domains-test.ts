/**
 * Test 23: allowed_domains filter A/B test
 *
 * Compares native OpenAI SDK with and without allowed_domains filter.
 * Tests on courts that previously had "wrong site" problems.
 *
 * Usage: bun src/tests/23-allowed-domains-test.ts
 */
import { runCourtSearchNative, type AgentTrace } from "../lib/run-court-search-native.ts";

const JUSTICE_DOMAINS = [
  "cours-appel.justice.fr",
  "courdecassation.fr",
  // Legacy domains for specific courts
  "ca-papeete.justice.fr",
  "ca-besancon.justice.fr",
  "ca-noumea.justice.fr",
  "ca-cayenne.justice.fr",
  "ca-bastia.justice.fr",
];

// Courts that had problems + a few known-good for control
const TEST_COURTS = [
  "Paris",      // control — known-good
  "Besançon",   // was finding wrong site
  "Cayenne",    // was failing entirely
  "Rennes",     // native found old PDF
  "Bordeaux",   // was finding old PDF
  "Amiens",     // was finding old PDF
];

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function summarize(trace: AgentTrace): string {
  if (trace.error) return `ERR: ${trace.error.slice(0, 80)}`;
  const date = trace.result?.publicationDate || "null";
  const src = trace.result?.publicationDateSource || "-";
  const turns = trace.steps.length;
  return `${date} (${src}) ${turns}t ${fmt(trace.totalMs)}`;
}

function traceTools(trace: AgentTrace): string {
  return trace.steps.map((s) => {
    const calls = s.events
      .filter((e) => e.type === "function_call" || e.type === "web_search")
      .map((e) => {
        if (e.type === "web_search") return "🔍";
        if (e.type === "function_call") {
          const url = e.arguments?.url || "";
          const domain = url.match(/https?:\/\/([^/]+)/)?.[1] || url.slice(0, 40);
          return `${e.name}(${domain})`;
        }
        return "";
      });
    return calls.length > 0 ? calls.join(", ") : "💬 final";
  }).join(" → ");
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Test 23: allowed_domains A/B Test                  ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Domains: ${JUSTICE_DOMAINS.join(", ")}`);
  console.log(`Courts: ${TEST_COURTS.length}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: Array<{
    court: string;
    open: AgentTrace;
    filtered: AgentTrace;
  }> = [];

  for (const court of TEST_COURTS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${court}`);
    console.log("─".repeat(60));

    console.log(`  [Open] Starting...`);
    const open = await runCourtSearchNative(court);
    console.log(`  [Open] ${summarize(open)}`);
    console.log(`    Path: ${traceTools(open)}`);

    console.log(`  [Filtered] Starting...`);
    const filtered = await runCourtSearchNative(court, { allowedDomains: JUSTICE_DOMAINS });
    console.log(`  [Filtered] ${summarize(filtered)}`);
    console.log(`    Path: ${traceTools(filtered)}`);

    results.push({ court, open, filtered });
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(100)}`);
  console.log("RESULTS");
  console.log("═".repeat(100));

  const header = [
    "Court".padEnd(16),
    "Open Date".padEnd(14),
    "Filtered Date".padEnd(14),
    "Match".padEnd(7),
    "Open Src".padEnd(13),
    "Filt Src".padEnd(13),
    "Open Time".padEnd(10),
    "Filt Time",
  ].join("│");
  console.log(header);
  console.log("─".repeat(100));

  for (const { court, open, filtered } of results) {
    const oDate = open.result?.publicationDate || (open.error ? "ERR" : "null");
    const fDate = filtered.result?.publicationDate || (filtered.error ? "ERR" : "null");
    const match = oDate === fDate ? " ✓" : " ✗";

    console.log([
      court.padEnd(16),
      oDate.padEnd(14),
      fDate.padEnd(14),
      match.padEnd(7),
      (open.result?.publicationDateSource || "-").padEnd(13),
      (filtered.result?.publicationDateSource || "-").padEnd(13),
      fmt(open.totalMs).padEnd(10),
      fmt(filtered.totalMs),
    ].join("│"));
  }

  console.log("─".repeat(100));

  // ── Detailed divergences ──────────────────────────────────────────
  const divergent = results.filter(
    (r) => r.open.result?.publicationDate !== r.filtered.result?.publicationDate
  );
  if (divergent.length > 0) {
    console.log(`\nDIVERGENCES (${divergent.length}):`);
    for (const { court, open, filtered } of divergent) {
      console.log(`\n── ${court} ──`);
      console.log(`  Open:     ${open.result?.publicationDate} — ${open.result?.dateExtractionExplanation?.slice(0, 200)}`);
      console.log(`  Filtered: ${filtered.result?.publicationDate} — ${filtered.result?.dateExtractionExplanation?.slice(0, 200)}`);
      console.log(`  Open path:     ${traceTools(open)}`);
      console.log(`  Filtered path: ${traceTools(filtered)}`);
    }
  } else {
    console.log(`\nAll courts agree — allowed_domains filter made no difference in dates.`);
  }

  // ── Save ──────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `docs/archive/allowed-domains-ab-${timestamp}.json`;
  const data = results.map(({ court, open, filtered }) => ({
    court,
    datesMatch: open.result?.publicationDate === filtered.result?.publicationDate,
    open: { date: open.result?.publicationDate, source: open.result?.publicationDateSource, turns: open.steps.length, totalMs: open.totalMs, error: open.error },
    filtered: { date: filtered.result?.publicationDate, source: filtered.result?.publicationDateSource, turns: filtered.steps.length, totalMs: filtered.totalMs, error: filtered.error },
  }));
  await Bun.write(path, JSON.stringify(data, null, 2));
  console.log(`\nSaved: ${path}`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(console.error);
