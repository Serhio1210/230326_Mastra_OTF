import { fetchPageTool } from "../mastra/tools/fetchpage/index.ts";
import { extractPdfDateTool } from "../mastra/tools/extractpdfdate/index.ts";

// Known URLs from our Sonnet runs (most reliable page URLs)
const COURTS: Record<string, string> = {
  "Lyon": "https://www.cours-appel.justice.fr/lyon/les-experts",
  "Bordeaux": "https://www.cours-appel.justice.fr/bordeaux/experts",
  "Amiens": "https://www.cours-appel.justice.fr/amiens/les-experts-judiciaires-pres-la-cour-dappel-damiens",
  "Angers": "https://www.cours-appel.justice.fr/angers/experts-judiciaires",
  "Besançon": "https://www.cours-appel.justice.fr/besancon/experts-judiciaires",
};

console.log("Ground truth: fetch actual pages + read actual PDFs (no LLM)\n");

for (const [court, pageUrl] of Object.entries(COURTS)) {
  console.log(`${"=".repeat(60)}\n${court}: ${pageUrl}\n`);

  // Step 1: Fetch the page
  const page = await fetchPageTool.execute({ url: pageUrl });

  if (!page.success) {
    console.log(`  Page FAILED: ${page.error}`);
    // Try legacy
    const legacy = court.toLowerCase().replace(/[éè]/g, "e").replace(/[à]/g, "a");
    const legacyUrl = `http://www.ca-${legacy}.justice.fr`;
    console.log(`  Trying legacy: ${legacyUrl}`);
    const legacyPage = await fetchPageTool.execute({ url: legacyUrl });
    if (legacyPage.success) {
      console.log(`  Legacy page title: ${legacyPage.title}`);
      console.log(`  Legacy PDFs: ${legacyPage.pdfLinks.length}`);
    } else {
      console.log(`  Legacy also FAILED: ${legacyPage.error}`);
    }
    console.log();
    continue;
  }

  console.log(`  Title: ${page.title}`);

  // Date hints from page text
  const dateHints = page.pageText.match(
    /(?:mise à jour|MAJ|actualis[ée])[^.]{0,80}?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/gi
  );
  if (dateHints) {
    console.log(`  Page date hints: ${dateHints.join(" | ")}`);
  }

  // Expert PDFs
  const expertPdfs = page.pdfLinks.filter(
    p => p.relevanceHint === "likely-expert-list" || p.relevanceHint === "possible-expert-list"
  );
  console.log(`  Expert PDFs found: ${expertPdfs.length}`);

  for (const pdf of expertPdfs) {
    console.log(`\n  PDF: ${pdf.text.slice(0, 80)}`);
    console.log(`  URL: ${pdf.url}`);

    // Step 2: Read the PDF
    const pdfResult = await extractPdfDateTool.execute({ url: pdf.url });
    if (pdfResult.success) {
      // Find date patterns in PDF text
      const pdfDates = pdfResult.pdfText.match(
        /(?:MAJ|mise à jour|arrêtée? (?:au|le)|assemblée.*?(?:du|le)|dressée.*?(?:du|le))[^.]{0,60}?\d{1,2}[/. -]\w+[/. -]\d{2,4}/gi
      );
      console.log(`  PDF pages: ${pdfResult.pageCount}`);
      console.log(`  PDF first 300 chars: ${pdfResult.pdfText.slice(0, 300)}`);
      if (pdfDates) {
        console.log(`  PDF date patterns: ${pdfDates.join(" | ")}`);
      } else {
        console.log(`  PDF date patterns: NONE FOUND`);
      }
    } else {
      console.log(`  PDF read FAILED: ${pdfResult.error}`);
    }
  }

  console.log();
}
