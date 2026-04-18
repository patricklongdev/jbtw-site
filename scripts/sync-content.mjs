/**
 * Copies scraped MDX files from output/mdx/ into src/content/chapters/
 * before every Astro build or dev start.
 */
import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '../../output/mdx');
const DEST = join(__dirname, '../src/content/chapters');

await mkdir(DEST, { recursive: true });

const files = await readdir(SOURCE).catch(() => {
  console.warn('sync-content: output/mdx/ not found — skipping');
  process.exit(0);
});

let copied = 0;
for (const file of files) {
  if (!file.endsWith('.mdx')) continue;
  await copyFile(join(SOURCE, file), join(DEST, file));
  copied++;
}

console.log(`sync-content: ${copied} MDX files → src/content/chapters/`);
