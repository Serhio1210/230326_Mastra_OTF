import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";

const url =
  process.argv[2] ||
  "https://www.cours-appel.justice.fr/sites/default/files/2026-03/ANNUPARIS%20MAJ%2010%20MARS%2026_2.pdf";

console.log(`Extracting PDF text: ${url}\n`);

const result = await extractPdfDateTool.execute({ url });

console.log("Success:", result.success);
console.log("Page count:", result.pageCount);
console.log("Text length:", result.pdfText.length);
console.log("\nFirst 1000 chars:\n", result.pdfText.slice(0, 1000));
if (result.error) console.log("\nError:", result.error);
