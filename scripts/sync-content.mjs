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

function stripLeadingArticle(slug) {
  return slug.replace(/^(?:a|an|the)-/, '');
}

function stripMatchingHeadings(body, subsectionSlug) {
  if (!subsectionSlug) return body;
  // Strip section-title headings repeated at the top of each scraped page.
  // Also strips an immediately-following ALL-CAPS line (orphaned second line of
  // a wrapped heading, e.g. "CANADA'S 'RADICAL' REFORM" after the ## line).
  // Comparison uses the first 30 slug chars to tolerate OCR variants like
  // "isoolation" vs "isolation". Leading articles (a/an/the) are stripped
  // before comparing to handle cases like slug "a-tuesday-..." vs heading "Tuesday...".
  const normalizedSubSlug = stripLeadingArticle(subsectionSlug);
  // Strip ALL occurrences of the subsection heading throughout the body.
  // Multi-page chapters stitched by the scraper repeat the heading at each
  // page boundary — every instance is redundant because the layout renders
  // the title as h1. The continuation group catches wrapped tails like
  // "v. THE QUEEN" (lowercase abbreviation) or ALL-CAPS second lines.
  let result = body.replace(
    /^([ \t]*#{1,3}[ \t]+.+\r?\n?)([A-Z][^a-z\n]*\r?\n|[a-z]\.[^a-z\n]*\r?\n)?/gm,
    (match, headingLine, continuationLine) => {
      const headingText = headingLine.replace(/^[ \t]*#{1,3}[ \t]+/, '').replace(/\r?\n$/, '').trim();
      const headingSlug = stripLeadingArticle(slugify(headingText));
      const compareLen = Math.min(headingSlug.length, normalizedSubSlug.length, 30);
      if (compareLen < 15) return match;
      if (headingSlug.slice(0, compareLen) !== normalizedSubSlug.slice(0, compareLen)) return match;
      return ''; // strip heading + optional ALL-CAPS continuation line
    }
  );

  return result;
}

function stripTopCapsFragments(body) {
  // Some scraped pages have bare ALL-CAPS title/navigation lines at the very
  // top of the body (chapter titles, breadcrumb echoes) that aren't wrapped in
  // a markdown heading. Strip any run of ALL-CAPS-only lines (no lowercase) that
  // appear before the first prose paragraph or markdown heading.
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }                        // skip blank lines
    if (!/[a-z]/.test(line) && line.length >= 10 && !line.startsWith('#')) {
      lines.splice(i, 1);                                // remove ALL-CAPS line
      while (i < lines.length && !lines[i].trim()) lines.splice(i, 1); // and following blanks
    } else {
      break;                                             // first prose/heading — stop
    }
  }
  return lines.join('\n');
}

function deduplicateParagraphs(body) {
  // Multi-page chapters were stitched by the scraper, sometimes duplicating
  // paragraphs that appeared at a page boundary. Remove any paragraph whose
  // first 120 characters match one already seen earlier in the same file.
  // Only considers substantive paragraphs (> 80 chars) to avoid false positives
  // on short headings or single-line fragments.
  const blocks = body.split(/(\n{2,})/); // split preserving separators
  const seen = new Set();
  const result = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Odd-indexed entries are the separators (\n\n etc.) — always keep them
    if (i % 2 === 1) {
      result.push(block);
      continue;
    }
    const text = block.trim();
    if (text.length > 80) {
      const key = text.slice(0, 120);
      if (seen.has(key)) continue; // skip duplicate
      seen.add(key);
    }
    result.push(block);
  }

  return result.join('');
}

function sanitizeMdx(content) {
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!fmMatch) return content;
  const [, frontmatter, body] = fmMatch;

  const subsectionSlug = extractSubsectionSlug(frontmatter);
  const bodyStripped = stripMatchingHeadings(body, subsectionSlug);
  const bodyCleaned = stripTopCapsFragments(bodyStripped);
  const bodyDeduped = deduplicateParagraphs(bodyCleaned);

  // Escape `<` that appear mid-word only when NOT followed by a known HTML tag.
  // This catches OCR artifacts (fO<xl) but preserves real tags (behaviour<sup>).
  let sanitized = bodyDeduped.replace(/([A-Za-z0-9])<([A-Za-z][A-Za-z0-9]*)/g, (match, pre, tagName) => {
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

// Sync case-law JSON data files (lightweight data collection, avoids MDX compile overhead)
const CASE_LAW_SOURCE = join(__dirname, '../../output/case-law-data');
const CASE_LAW_DEST = join(__dirname, '../src/content/case-law');
await mkdir(CASE_LAW_DEST, { recursive: true });

const caseFiles = await readdir(CASE_LAW_SOURCE).catch(() => []);
let caseCopied = 0;
for (const file of caseFiles) {
  if (!file.endsWith('.json')) continue;
  const raw = await readFile(join(CASE_LAW_SOURCE, file), 'utf8');
  await writeFile(join(CASE_LAW_DEST, file), raw, 'utf8');
  caseCopied++;
}
console.log(`sync-content: ${caseCopied} case-law JSON files → src/content/case-law/`);

// Sync appendix JSON data files
const APPENDIX_SOURCE = join(__dirname, '../../output/appendix-data');
const APPENDIX_DEST = join(__dirname, '../src/content/appendices');
await mkdir(APPENDIX_DEST, { recursive: true });

const appendixFiles = await readdir(APPENDIX_SOURCE).catch(() => []);
let appendixCopied = 0;
for (const file of appendixFiles) {
  if (!file.endsWith('.json')) continue;
  const raw = await readFile(join(APPENDIX_SOURCE, file), 'utf8');
  await writeFile(join(APPENDIX_DEST, file), raw, 'utf8');
  appendixCopied++;
}
console.log(`sync-content: ${appendixCopied} appendix JSON files → src/content/appendices/`);

// Sync Arbour Report JSON data files
const ARBOUR_SOURCE = join(__dirname, '../../output/arbour-data');
const ARBOUR_DEST = join(__dirname, '../src/content/arbour-report');
await mkdir(ARBOUR_DEST, { recursive: true });

const arbourFiles = await readdir(ARBOUR_SOURCE).catch(() => []);
let arbourCopied = 0;
for (const file of arbourFiles) {
  if (!file.endsWith('.json')) continue;
  const raw = await readFile(join(ARBOUR_SOURCE, file), 'utf8');
  await writeFile(join(ARBOUR_DEST, file), raw, 'utf8');
  arbourCopied++;
}
console.log(`sync-content: ${arbourCopied} Arbour Report JSON files → src/content/arbour-report/`);
