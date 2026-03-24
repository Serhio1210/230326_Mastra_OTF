import { z } from "zod";

export const expertFinderResultSchema = z.object({
  courtName: z.string().describe("The name of the Cour d'appel searched"),
  pageUrl: z
    .string()
    .nullable()
    .describe("The experts judiciaires page URL, or null if not found"),
  pageVerified: z
    .boolean()
    .describe("Whether the page URL was verified accessible (HTTP 200)"),
  documentUrl: z
    .string()
    .nullable()
    .describe("The expert list PDF URL, or null if not found"),
  documentTitle: z
    .string()
    .nullable()
    .describe("The title/text of the PDF link"),
  documentVerified: z
    .boolean()
    .describe("Whether the PDF URL was verified accessible (HTTP 200)"),
  publicationDate: z
    .string()
    .nullable()
    .describe("Publication date in YYYY-MM-DD format, or null if not found"),
  publicationDateSource: z
    .enum(["page-text", "link-text", "filename", "pdf-content", "not-found"])
    .describe("Where the publication date was found"),
  searchExplanation: z
    .string()
    .describe("How the page and document were found"),
  dateExtractionExplanation: z
    .string()
    .describe("How the publication date was determined, or why it could not be found"),
  errors: z
    .array(z.string())
    .describe("List of any errors encountered during the process"),
});

export type ExpertFinderResult = z.infer<typeof expertFinderResultSchema>;
