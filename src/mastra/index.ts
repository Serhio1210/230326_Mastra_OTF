import { Mastra } from "@mastra/core";
import { expertSearchAgent } from "./agents/expert-search.ts";

export const mastra = new Mastra({
  agents: { "expert-search-agent": expertSearchAgent },
});
