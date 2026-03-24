import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";

export const expertSearchAgent = new Agent({
  id: "expert-search-agent",
  name: "Expert Judiciaire Search Agent",
  instructions: `You are a research agent specialized in finding official French judicial resources.

Your task is to search for specific legal documents and official websites related to the French judicial system.

When searching:
1. Search for the topic using multiple relevant queries in French
2. Analyze the search results carefully — distinguish official government/court websites from unofficial directories
3. Look for domains like .gouv.fr, .justice.fr, or official court websites
4. If you find candidate URLs, search again to verify they are the official source
5. Return a structured summary with:
   - The official website URL (if found)
   - A brief description of what the resource contains
   - Any alternative or supplementary official sources
   - Whether the list is freely accessible or requires registration

Always prefer official sources (.gouv.fr, .justice.fr, cours-appel.justice.fr) over third-party directories.`,
  model: anthropic("claude-sonnet-4-6"),
  tools: {
    web_search: anthropic.tools.webSearch_20250305({
      maxUses: 10,
      userLocation: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
        timezone: "Europe/Paris",
      },
    }),
  },
});
