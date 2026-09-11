// Inspect chapter starts in an exported PDF using Poppler's pdftotext.
// Usage: node scripts/check-pdf.cjs manuscript.libria book.pdf
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pages = execFileSync('pdftotext', ['-layout', process.argv[3], '-'], { maxBuffer: 100 * 1024 * 1024 })
  .toString().split('\f');
if (!pages.at(-1).trim()) pages.pop();
const chapters = doc.chapters.map(chapter => {
  const page = pages.findIndex(p => p.split('\n').some(line => line.trim() === chapter.title)) + 1;
  return { title: chapter.title, page, error: !page ? 'Chapter heading not found'
    : chapter.forceOddPage && page % 2 === 0 ? 'Expected odd page' : null };
});
console.log(JSON.stringify({ pages: pages.length, chapters, errors: chapters.filter(c => c.error).length }, null, 2));
if (chapters.some(c => c.error)) process.exitCode = 1;
