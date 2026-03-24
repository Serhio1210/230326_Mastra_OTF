import { mastra } from "../mastra/index.ts";

const agent = mastra.getAgent("expert-search-agent");

console.log("Debug: Cayenne — tracking every step\n");
const start = Date.now();

try {
  const result = await agent.generate(
    "Trouve la liste officielle des experts judiciaires de la Cour d'appel de Cayenne.",
    { maxSteps: 15 }
  );

  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
  console.log("Steps:", result.steps?.length);

  for (const [i, step] of (result.steps || []).entries()) {
    console.log(`\n--- Step ${i + 1} ---`);
    console.log("Tool calls:", step.toolCalls?.length || 0);
    for (const tc of step.toolCalls || []) {
      console.log(`  Tool: ${tc.toolName || "provider-tool"}`);
      console.log(`  Args: ${JSON.stringify(tc.args)?.slice(0, 200)}`);
    }
    console.log("Tool results:", step.toolResults?.length || 0);
    for (const tr of step.toolResults || []) {
      console.log(`  Tool: ${tr.toolName || "provider-tool"}`);
      const resultStr = JSON.stringify(tr.result)?.slice(0, 300);
      console.log(`  Result: ${resultStr}`);
    }
    if (step.text) {
      console.log("Text:", step.text.slice(0, 300));
    }
  }

  console.log("\n--- Final text ---");
  console.log(result.text?.slice(0, 1000));
} catch (error: any) {
  console.log(`Failed in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
  console.log("Error name:", error.name);
  console.log("Error message:", error.message?.slice(0, 500));

  // Check if it's an API error with response details
  if (error.statusCode) console.log("Status code:", error.statusCode);
  if (error.responseBody) console.log("Response body:", error.responseBody?.slice(0, 500));
  if (error.cause) console.log("Cause:", String(error.cause)?.slice(0, 500));
  if (error.data) console.log("Data:", JSON.stringify(error.data)?.slice(0, 500));
  if (error.value) console.log("Value:", JSON.stringify(error.value)?.slice(0, 500));

  // Full error for inspection
  console.log("\nFull error keys:", Object.keys(error));
}
