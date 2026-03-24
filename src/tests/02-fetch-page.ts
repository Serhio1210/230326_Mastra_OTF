import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";

const url = process.argv[2] || "https://www.cours-appel.justice.fr/paris/experts-judiciaires";

console.log(`Fetching: ${url}\n`);

const result = await fetchPageTool.execute({ url });

console.log("Success:", result.success);
console.log("Title:", result.title);
console.log("Page text (first 500 chars):", result.pageText.slice(0, 500));
console.log("\nPDF links found:", result.pdfLinks.length);
for (const pdf of result.pdfLinks) {
  console.log(`  [${pdf.relevanceHint}] ${pdf.text.slice(0, 80)}`);
  console.log(`    ${pdf.url}`);
}
if (result.error) console.log("\nError:", result.error);
