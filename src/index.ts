import { Hono } from "hono";
import { type HonoBindings, type HonoVariables, MastraServer } from "@mastra/hono";
import { mastra } from "./mastra/index.ts";

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
const server = new MastraServer({ app, mastra });

await server.init();

app.get("/", (c) => {
  return c.text("Hello from Hono + Mastra on Bun!");
});

export default {
  port: 3000,
  fetch: app.fetch,
};
