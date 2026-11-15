import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const chunks = [];
for (const file of await readdir('dist/assets')) {
  if (!/\.(js|css)$/.test(file)) continue;
  const content = await readFile(`dist/assets/${file}`);
  chunks.push({ file, bytes: content.length, gzipBytes: gzipSync(content).length });
}
const gzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
// Bounding every chunk also bounds the initial graph, including locale variants.
assert.ok(gzipBytes <= 800 * 1024, `JS/CSS gzip upper bound ${gzipBytes} exceeds 800 KiB`);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/bundle-size.json',
  JSON.stringify(
    {
      scope: 'all JS/CSS chunks (upper bound on initial load)',
      gzipBytes,
      limitBytes: 800 * 1024,
      chunks,
    },
    null,
    2,
  ),
);
console.log(`All JS/CSS gzip: ${(gzipBytes / 1024).toFixed(1)} KiB <= 800 KiB`);
