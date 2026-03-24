import { mastra } from "./mastra/index.ts";
import { expertFinderResultSchema } from "./mastra/schemas/expert-finder.ts";

const agent = mastra.getAgent("expert-search-agent");
const court = process.argv[2] || "Paris";

console.log(`Searching for: Cour d'appel de ${court} — experts judiciaires\n`);

const result = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}.
Trouve le site web officiel, le lien vers le PDF de la liste, et la date de publication.`,
  {
    structuredOutput: {
      schema: expertFinderResultSchema,
    },
  }
);

const output = result.object;
console.log(JSON.stringify(output, null, 2));
