import { defineCollection, z } from 'astro:content';

const chapters = defineCollection({
  type: 'content',
  schema: z.object({
    cid: z.number(),
    title: z.string(),
    book: z.enum(['justice-behind-the-walls', 'prisoners-of-isolation']),
    sector: z.string().nullable().optional(),
    sector_number: z.number().nullable().optional(),
    chapter: z.string().nullable().optional(),
    chapter_number: z.number().nullable().optional(),
    chapter_slug: z.string().nullable().optional(),
    breadcrumb: z.array(z.string()),
    source_url: z.string(),
    page_count: z.number(),
    has_footnotes: z.boolean(),
  }),
});

export const collections = { chapters };
