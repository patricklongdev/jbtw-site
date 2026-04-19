/**
 * Audits src/content/chapters/ for:
 *   1. Duplicate headings — first heading in body matches subsection_slug
 *   2. Orphaned title fragments — short non-heading lines at top that look
 *      like a wrapped title continuation (ALL-CAPS or "v. WORD" pattern)
 *   3. Repeated content — large paragraph blocks that appear 2+ times
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '../src/content/chapters');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function stripLeadingArticle(slug) {
  return slug.replace(/^(?:a|an|the)-/, '');
}

function extractFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const body = m[2];
  const slugM = fm.match(/^subsection_slug:\s*(?:'([^']*)'|"([^"]*)"|(.+?)\s*$)/m);
  const titleM = fm.match(/^subsection_title:\s*(?:'([^']*)'|"([^"]*)"|(.+?)\s*$)/m);
  const cidM = fm.match(/^cid:\s*(\d+)/m);
  return {
    cid: cidM ? cidM[1] : '?',
    subsection_slug: slugM ? (slugM[1] ?? slugM[2] ?? slugM[3] ?? '').trim() : '',
    subsection_title: titleM ? (titleM[1] ?? titleM[2] ?? titleM[3] ?? '').trim() : '',
    body,
  };
}

const issues = {
  duplicateHeading: [],
  orphanedFragment: [],
  repeatedContent: [],
};

const files = (await readdir(DIR)).filter(f => f.endsWith('.mdx')).sort();

for (const file of files) {
  const raw = await readFile(join(DIR, file), 'utf8');
  const fm = extractFrontmatter(raw);
  if (!fm) continue;
  const { cid, subsection_slug, subsection_title, body } = fm;

  if (!subsection_slug) continue;

  const normalizedSub = stripLeadingArticle(subsection_slug);
  const lines = body.split('\n');

  // ── 1. Duplicate heading check ─────────────────────────────────────
  // Find the first non-blank line in the body
  let firstNonBlank = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) { firstNonBlank = i; break; }
  }

  if (firstNonBlank >= 0) {
    const line = lines[firstNonBlank];
    const headingMatch = line.match(/^[ \t]*#{1,3}[ \t]+(.+)/);
    if (headingMatch) {
      const headingSlug = stripLeadingArticle(slugify(headingMatch[1]));
      const compareLen = Math.min(headingSlug.length, normalizedSub.length, 30);
      if (compareLen >= 15 && headingSlug.slice(0, compareLen) === normalizedSub.slice(0, compareLen)) {
        issues.duplicateHeading.push({ file, cid, heading: line.trim(), subsection_slug });
      }
    }

    // ── 2. Orphaned fragment check ─────────────────────────────────────
    // Non-heading first line that looks like a wrapped title tail:
    // all-caps, or "v. CAPS", or short italic/bold fragment
    if (!headingMatch) {
      const txt = line.trim();
      if (
        txt.length > 0 && txt.length < 80 &&
        (
          /^[A-Z][^a-z]{4,}$/.test(txt) ||            // ALL CAPS line
          /^[a-z]\.\s+[A-Z]/.test(txt) ||              // v. THE QUEEN style
          /^\*[A-Z]/.test(txt)                          // *McCANN* style italic
        )
      ) {
        issues.orphanedFragment.push({ file, cid, fragment: txt, subsection_slug });
      }
    }
  }

  // ── 3. Repeated content check ──────────────────────────────────────
  // Split body into paragraphs; flag any that appear 2+ times
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 100 && !p.startsWith('#') && !p.startsWith('---'));

  const seen = new Map();
  for (const para of paragraphs) {
    const key = para.slice(0, 120);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([, n]) => n > 1);
  if (repeated.length) {
    issues.repeatedContent.push({
      file, cid,
      count: repeated.length,
      sample: repeated[0][0].slice(0, 80) + '…',
    });
  }
}

// ── Report ─────────────────────────────────────────────────────────────
console.log(`\n── Duplicate headings (${issues.duplicateHeading.length}) ────────────────────────`);
for (const i of issues.duplicateHeading) {
  console.log(`  cid ${i.cid.padStart(4)} ${i.file}  →  "${i.heading}"`);
}

console.log(`\n── Orphaned title fragments (${issues.orphanedFragment.length}) ───────────────────`);
for (const i of issues.orphanedFragment) {
  console.log(`  cid ${i.cid.padStart(4)} ${i.file}  →  "${i.fragment}"`);
}

console.log(`\n── Repeated content blocks (${issues.repeatedContent.length}) ──────────────────────`);
for (const i of issues.repeatedContent) {
  console.log(`  cid ${i.cid.padStart(4)} ${i.file}  (${i.count} duplicate para(s))  →  "${i.sample}"`);
}

const total = issues.duplicateHeading.length + issues.orphanedFragment.length + issues.repeatedContent.length;
console.log(`\nTotal issues: ${total} across ${files.length} files.\n`);
