import { Hono } from "hono";
import { type HonoBindings, type HonoVariables, MastraServer } from "@mastra/hono";
import { mastra } from "./mastra/index.ts";

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
const server = new MastraServer({ app, mastra });

await server.init();

app.get("/", (c) => {
  return c.text("Expert Search API — Mastra + Hono on Bun");
});

// Quick test endpoint for Paris
app.get("/test/paris", async (c) => {
  const agent = mastra.getAgent("expert-search-mini");
  const start = Date.now();

  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Paris. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.",
    { maxSteps: 10 }
  );

  const ms = Date.now() - start;

  return c.json({
    court: "Paris",
    agent: "expert-search-mini",
    time: `${(ms / 1000).toFixed(1)}s`,
    usage: result.usage,
    text: result.text,
    steps: result.steps?.map((step: any, i: number) => ({
      step: i,
      toolCalls: step.toolCalls?.map((tc: any) => ({
        tool: tc.payload?.toolName || "provider-tool",
        args: tc.payload?.args,
      })),
      toolResults: step.toolResults?.map((tr: any) => ({
        tool: tr.payload?.toolName || "provider-tool",
        success: tr.payload?.result?.success,
        title: tr.payload?.result?.title,
        pdfCount: tr.payload?.result?.pdfLinks?.length,
        pdfText: tr.payload?.result?.pdfText?.slice(0, 200),
        error: tr.payload?.result?.error,
      })),
    })),
  });
});

// Test any court
app.get("/test/:court", async (c) => {
  const court = decodeURIComponent(c.req.param("court"));
  const agent = mastra.getAgent("expert-search-mini");
  const start = Date.now();

  const result = await agent.generate(
    `Trouve la liste officielle des experts judiciaires de la Cour d'appel de ${court}. Utilise fetchPage puis extractPdfDate pour trouver la date officielle dans le PDF.`,
    { maxSteps: 10 }
  );

  const ms = Date.now() - start;

  return c.json({
    court,
    agent: "expert-search-mini",
    time: `${(ms / 1000).toFixed(1)}s`,
    usage: result.usage,
    text: result.text.slice(0, 1000),
  });
});

export default {
  port: 3000,
  fetch: app.fetch,
};
