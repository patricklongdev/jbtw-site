import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [mdx()],
  output: 'static',
  trailingSlash: 'always',
  redirects: {
    '/resources/arbour_report/arbour_rpt.htm': '/resources/arbour-report/',
  },
});
