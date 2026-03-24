import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  messages: [
    {
      role: "user",
      content:
        "Trouve le site officiel de la liste des experts judiciaires de la Cour d'appel de Paris. Vérifie que c'est bien le site officiel (.justice.fr ou .gouv.fr). Donne l'URL exacte et décris ce qu'on y trouve.",
    },
  ],
  tools: [
    {
      type: "web_search_20260209",
      name: "web_search",
      user_location: {
        type: "approximate",
        country: "FR",
        region: "Île-de-France",
        city: "Paris",
        timezone: "Europe/Paris",
      },
    },
  ],
});

// Extract text and citations from response
for (const block of response.content) {
  if (block.type === "text") {
    console.log(block.text);
    if ("citations" in block && Array.isArray(block.citations)) {
      for (const cite of block.citations) {
        if ("url" in cite) console.log(`  [source: ${cite.url}]`);
      }
    }
  }
}

console.log(`\n--- Usage ---`);
console.log(`Input tokens: ${response.usage.input_tokens}`);
console.log(`Output tokens: ${response.usage.output_tokens}`);
console.log(`Searches: ${(response.usage as any).server_tool_use?.web_search_requests ?? "n/a"}`);
