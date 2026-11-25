import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.cwd(), 'out');

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    })
  );
  return nested.flat();
}

const files = (await listFiles(OUT_DIR))
  .map((file) => path.relative(OUT_DIR, file).split(path.sep).join('/'))
  .filter((file) => !['sw.js', '_headers', '_redirects'].includes(file))
  .sort();

const hash = createHash('sha256');
const urlSet = new Set();

for (const file of files) {
  hash.update(file).update(await readFile(path.join(OUT_DIR, file)));
  const url = '/' + file.replace(/(^|\/)index\.html$/, '$1');
  urlSet.add(url);
}

const urls = Array.from(urlSet).sort();
const version = hash.digest('hex').slice(0, 12);
const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
if (!template.includes('__VERSION__') || !template.includes('__PRECACHE_URLS__')) {
  throw new Error('sw-template.js is missing required placeholder tokens.');
}
const rendered = template
  .replaceAll('__VERSION__', JSON.stringify(version))
  .replaceAll('__PRECACHE_URLS__', JSON.stringify(urls, null, 2));

await writeFile(path.join(OUT_DIR, 'sw.js'), rendered, 'utf8');
console.log(`Generated out/sw.js (version ${version}, ${urls.length} precached URLs)`);
