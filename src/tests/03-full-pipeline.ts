import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const agent = mastra.getAgent("expert-search-agent");
const court = process.argv[2] || "Paris";

console.log(`Full pipeline: Cour d'appel de ${court}\n`);

const result = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}.
Trouve le site web officiel, utilise fetchPage pour extraire les liens PDF,
choisis le PDF le plus récent, et détermine la date de publication.`,
  {
    structuredOutput: {
      schema: expertFinderResultSchema,
    },
    maxSteps: 10,
  }
);

console.log(JSON.stringify(result.object, null, 2));
