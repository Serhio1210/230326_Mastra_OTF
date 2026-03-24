import { Mastra } from "@mastra/core";
import { Observability, DefaultExporter } from "@mastra/observability";
import { LibSQLStore } from "@mastra/libsql";
import { expertSearchAgent } from "./agents/expert-search.ts";
import { expertSearchMiniAgent } from "./agents/expert-search-mini.ts";
import { expertSearchHaikuAgent } from "./agents/expert-search-haiku.ts";

const storage = new LibSQLStore({
  id: "mastra-storage",
  url: "file:./mastra.db",
});

const observability = new Observability({
  configs: {
    default: {
      serviceName: "expert-search",
      sampling: { type: "always" },
      exporters: [
        new DefaultExporter({ strategy: "realtime" }),
      ],
    },
  },
});

export const mastra = new Mastra({
  agents: {
    "expert-search-agent": expertSearchAgent,
    "expert-search-mini": expertSearchMiniAgent,
    "expert-search-haiku": expertSearchHaikuAgent,
  },
  storage,
  observability,
});
