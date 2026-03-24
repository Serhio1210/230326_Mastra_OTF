import { mastra } from "../mastra/index.ts";
import { expertFinderResultSchema } from "../mastra/schemas/expert-finder.ts";

const agent = mastra.getAgent("expert-search-agent");
const court = process.argv[2] || "Paris";

console.log(`Full pipeline (with PDF): Cour d'appel de ${court}\n`);

const result = await agent.generate(
  `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}.
Trouve le site web officiel, utilise fetchPage pour extraire les liens PDF,
choisis le PDF le plus récent, puis utilise extractPdfDate pour lire le contenu
du PDF et trouver la date officielle de publication.`,
  {
    structuredOutput: {
      schema: expertFinderResultSchema,
      model: "anthropic/claude-haiku-4-5",
    },
    maxSteps: 10,
  }
);

console.log(JSON.stringify(result.object, null, 2));
