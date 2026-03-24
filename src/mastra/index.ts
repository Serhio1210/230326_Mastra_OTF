import { Mastra } from "@mastra/core";
import { Observability, ConsoleExporter, DefaultExporter } from "@mastra/observability";
import { LibSQLStore } from "@mastra/libsql";
import { expertSearchAgent } from "./agents/expert-search.ts";
import { expertSearchMiniAgent } from "./agents/expert-search-mini.ts";

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
        new ConsoleExporter(),
        new DefaultExporter({ strategy: "realtime" }),
      ],
    },
  },
});

export const mastra = new Mastra({
  agents: {
    "expert-search-agent": expertSearchAgent,
    "expert-search-mini": expertSearchMiniAgent,
  },
  storage,
  observability,
});
