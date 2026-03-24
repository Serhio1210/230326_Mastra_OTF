import { mastra } from "./mastra/index.ts";

const agent = mastra.getAgent("expert-search-agent");

console.log("Searching for: Cours d'appel de Paris - Liste des experts judiciaires\n");

const result = await agent.generate(
  `Recherche la liste officielle des experts judiciaires de la Cour d'appel de Paris.

  Je cherche le site officiel où on peut consulter cette liste.
  Trouve le site web officiel, vérifie qu'il s'agit bien du site de la juridiction ou du ministère de la Justice,
  et donne-moi l'URL exacte ainsi qu'une description de ce qu'on y trouve.`
);

console.log(result.text);

// Extract sources from tool results (Anthropic web search)
const webSearchResults = result.steps?.flatMap(
  (step: any) =>
    step.toolResults?.filter(
      (tr: any) => tr.toolName === "web_search"
    ) ?? []
) ?? [];

if (webSearchResults.length > 0) {
  const urls = new Set<string>();
  for (const tr of webSearchResults) {
    const sources = tr.result?.sources ?? tr.output?.sources ?? [];
    for (const s of sources) {
      if (s.url) urls.add(s.url);
    }
  }
  if (urls.size > 0) {
    console.log("\n--- Sources visited ---");
    for (const url of urls) {
      console.log(`- ${url}`);
    }
  }
}
