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
    chapter_number: z.number().nullable().optional(),
    chapter_slug: z.string().nullable().optional(),
    breadcrumb: z.array(z.string()).optional(),
    source_url: z.string().optional(),
    page_count: z.number().optional(),
    has_footnotes: z.boolean().optional(),
  }),
});

export const collections = { chapters };
