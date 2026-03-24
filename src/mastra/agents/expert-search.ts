import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { expertFinderResultSchema } from "../schemas/expert-finder.ts";
import { fetchPageTool } from "../tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../tools/extractpdfdate/index.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "./instructions.ts";

export const expertSearchAgent = new Agent({
  id: "expert-search-agent",
  name: "Expert Judiciaire Search Agent",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: anthropic("claude-sonnet-4-6"),
  tools: {
    web_search: anthropic.tools.webSearch_20260209({
      maxUses: 10,
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
  providerOptions: {
    anthropic: {
      effort: "low",
    },
  },
});

export { expertFinderResultSchema };
