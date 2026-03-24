import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const agent = mastra.getAgent("expert-search-agent");
const court = process.argv[2] || "Paris";

console.log(`Optimized pipeline: Cour d'appel de ${court}\n`);
const start = Date.now();

const result = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}.
Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
  {
    maxSteps: 15,
    structuredOutput: {
      schema: expertFinderResultSchema,
      instructions: `Extract the court expert search results from the agent's response.
Look for: court name, page URL on justice.fr, PDF document URL and title,
publication date in YYYY-MM-DD format, and where the date was found
(pdf-content, page-text, link-text, filename, or not-found).
Also extract the search explanation, date extraction explanation, and any errors.`,
      model: "anthropic/claude-haiku-4-5" as const,
      errorStrategy: "warn" as const,
    },
  }
);

console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
console.log(JSON.stringify(result.object, null, 2));
