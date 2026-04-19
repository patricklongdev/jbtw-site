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

const HTML_TAGS = new Set([
  'a','abbr','address','area','article','aside','audio','b','base','bdi','bdo',
  'blockquote','body','br','button','canvas','caption','cite','code','col',
  'colgroup','data','datalist','dd','del','details','dfn','dialog','div','dl',
  'dt','em','embed','fieldset','figcaption','figure','footer','form','h1','h2',
  'h3','h4','h5','h6','head','header','hr','html','i','iframe','img','input',
  'ins','kbd','label','legend','li','link','main','map','mark','menu','meta',
  'meter','nav','noscript','object','ol','optgroup','option','output','p',
  'picture','pre','progress','q','rp','rt','ruby','s','samp','script','section',
  'select','small','source','span','strong','style','sub','summary','sup',
  'table','tbody','td','template','textarea','tfoot','th','thead','time',
  'title','tr','track','u','ul','var','video','wbr',
]);

function extractSubsectionSlug(frontmatter) {
  const m = frontmatter.match(/^subsection_slug:\s*(?:'([^']*)'|"([^"]*)"|(.+?)\s*$)/m);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function stripMatchingHeadings(body, subsectionSlug) {
  if (!subsectionSlug) return body;
  // Strip headings whose slugified text is a prefix of the subsection slug (≥20 chars).
  // The old ASP site repeated the section title at the top of each paginated page;
  // OCR artifacts (apostrophes → nothing) and line-wrapping mean exact text match fails.
  // Use a greedy match and extract heading text from the full match string.
  return body.replace(/^[ \t]*#{1,3}[ \t]+.+\r?\n?/gim, (match) => {
    const headingText = match.replace(/^[ \t]*#{1,3}[ \t]+/, '').replace(/\r?\n$/, '').trim();
    const headingSlug = slugify(headingText);
    if (headingSlug.length >= 20 && subsectionSlug.startsWith(headingSlug)) return '';
    return match;
  });
}

function sanitizeMdx(content) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!fmMatch) return content;
  const [, frontmatter, body] = fmMatch;

  const subsectionSlug = extractSubsectionSlug(frontmatter);
  const bodyStripped = stripMatchingHeadings(body, subsectionSlug);

  // Escape `<` that appear mid-word only when NOT followed by a known HTML tag.
  // This catches OCR artifacts (fO<xl) but preserves real tags (behaviour<sup>).
  let sanitized = bodyStripped.replace(/([A-Za-z0-9])<([A-Za-z][A-Za-z0-9]*)/g, (match, pre, tagName) => {
    if (HTML_TAGS.has(tagName.toLowerCase())) return match;
    return `${pre}&lt;${tagName}`;
  });

  // Escape bare { and } — MDX treats these as JS expression delimiters.
  // This content never uses JS expressions so all braces are OCR artifacts.
  sanitized = sanitized.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

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
