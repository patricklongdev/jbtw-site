/**
 * Copies scraped MDX files from output/mdx/ into src/content/chapters/,
 * sanitizing bare `<` characters that aren't valid HTML/JSX tags so MDX
 * doesn't choke on OCR artifacts like `fO<xl`.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
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

function sanitizeMdx(content) {
  // Split off frontmatter so we don't touch YAML
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!fmMatch) return content;
  const [, frontmatter, body] = fmMatch;

  // Escape `<` that appear mid-word (OCR artifacts like `fO<xl`).
  // Real HTML/JSX tags always have `<` at a word boundary.
  const sanitized = body.replace(/([A-Za-z0-9])<(?=[A-Za-z])/g, '$1&lt;');

  return frontmatter + sanitized;
}

let copied = 0;
for (const file of files) {
  if (!file.endsWith('.mdx')) continue;
  const raw = await readFile(join(SOURCE, file), 'utf8');
  await writeFile(join(DEST, file), sanitizeMdx(raw), 'utf8');
  copied++;
}

console.log(`sync-content: ${copied} MDX files → src/content/chapters/`);
