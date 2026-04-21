import { defineCollection, z } from 'astro:content';

const chapters = defineCollection({
  type: 'content',
  schema: z.object({
    cid: z.number(),
    title: z.string(),
    book: z.enum(['justice-behind-the-walls', 'prisoners-of-isolation']).optional(),
    sector: z.string().nullable().optional(),
    sector_number: z.number().nullable().optional(),
    chapter: z.string().nullable().optional(),
    chapter_number: z.union([z.number(), z.string()]).nullable().optional(),
    chapter_slug: z.string().nullable().optional(),
    subsection_number: z.number().optional(),
    subsection_slug: z.string().optional(),
    subsection_title: z.string().optional(),
    breadcrumb: z.array(z.string()).optional(),
    source_url: z.string().optional(),
    page_count: z.number().optional(),
    has_footnotes: z.boolean().optional(),
  }),
});

const caseLaw = defineCollection({
  type: 'data',
  schema: z.object({
    slug: z.string(),
    case_name: z.string(),
    parties: z.string().optional(),
    citation: z.string().optional(),
    court: z.string().optional(),
    source_file: z.string().optional(),
    body_html: z.string(),
  }),
});

const appendices = defineCollection({
  type: 'data',
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    source_file: z.string().optional(),
    body_html: z.string(),
  }),
});

export const collections = { chapters, 'case-law': caseLaw, appendices };
