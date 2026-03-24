import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { TokenLimiter } from "@mastra/core/processors";
import { fetchPageTool } from "../tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../tools/extractpdfdate/index.ts";
import { EXPERT_SEARCH_INSTRUCTIONS } from "./instructions.ts";

export const expertSearchMiniAgent = new Agent({
  id: "expert-search-mini",
  name: "Expert Search (GPT-5.4 Mini)",
  instructions: EXPERT_SEARCH_INSTRUCTIONS,
  model: openai("gpt-5.4-mini"),
  tools: {
    webSearch: openai.tools.webSearch({
      userLocation: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
      },
    }),
    fetchPage: fetchPageTool,
    extractPdfDate: extractPdfDateTool,
  },
  inputProcessors: [new TokenLimiter(100000)],
});
