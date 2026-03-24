import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { fetchPageTool } from "../tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../tools/extractpdfdate/index.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "./instructions.ts";

export const expertSearchHaikuAgent = new Agent({
  id: "expert-search-haiku",
  name: "Expert Search (Haiku 4.5)",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: anthropic("claude-haiku-4-5"),
  tools: {
    web_search: anthropic.tools.webSearch_20250305({
      maxUses: 10,
      allowedDomains: ["justice.fr", "gouv.fr"],
      userLocation: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
        timezone: "Europe/Paris",
      },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});
