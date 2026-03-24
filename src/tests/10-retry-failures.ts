import { runCourtSearch } from "../lib/run-court-search.ts";

const RETRIES = ["Metz", "Cayenne"];

console.log(`Retrying ${RETRIES.length} failed courts (sequential)\n`);

for (const court of RETRIES) {
  console.log(`--- ${court} ---`);
  const result = await runCourtSearch(court);

  if (result.success && result.result) {
    console.log(`✓ ${result.result.publicationDate} (${result.result.publicationDateSource}) [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
    console.log(JSON.stringify(result.result, null, 2));
  } else {
    console.log(`✗ FAILED: ${result.error} [${(result.timing.totalMs / 1000).toFixed(0)}s]`);
  }
  console.log();
}
