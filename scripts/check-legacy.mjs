import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  await readFile(new URL('../docs/legacy-manifest.json', import.meta.url), 'utf8'),
);
async function paths(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await paths(path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unexpected legacy entry: ${path}`);
  }
  return files;
}
const actualPaths = await paths('old');
for (const path of actualPaths)
  if (!Object.hasOwn(manifest, path)) throw new Error(`Legacy baseline added: ${path}`);
for (const [path, expected] of Object.entries(manifest)) {
  const actual = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
  if (actual !== expected) throw new Error(`Legacy baseline changed: ${path}`);
}
console.log(`Legacy baseline intact: ${Object.keys(manifest).length} files`);
