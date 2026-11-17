import { readFile, writeFile, mkdir, cp, readdir, access } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const web = JSON.parse(await readFile('dist/diagnostics-manifest.json', 'utf8'));
const replay = JSON.parse(
  await readFile('artifacts/replay-build/diagnostics-manifest.json', 'utf8'),
);
if (web.buildId !== replay.buildId || !/^[a-zA-Z0-9._-]+$/.test(web.buildId))
  throw new Error('Builds must have the same safe buildId');
const directory = resolve('artifacts/diagnostic-builds', web.buildId);
try {
  await access(resolve(directory, 'archive.json'));
  throw new Error('Archive already exists; refusing to overwrite');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(directory, { recursive: true });
await cp('dist', resolve(directory, 'web'), { recursive: true });
await cp('artifacts/replay-build', resolve(directory, 'replay'), { recursive: true });
await mkdir(resolve(directory, 'source'));
for (const path of [
  'src',
  'public',
  'index.html',
  'replay.html',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
])
  await cp(path, resolve(directory, 'source', path), { recursive: true });
await writeFile(resolve(directory, 'source/SOURCE_COMMIT'), web.commit + '\n');
const hashes = {};
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(target);
    else
      hashes[relative(directory, target)] = createHash('sha256')
        .update(await readFile(target))
        .digest('hex');
  }
}
await walk(directory);
await writeFile(
  resolve(directory, 'archive.json'),
  JSON.stringify(
    { buildId: web.buildId, version: web.version, commit: web.commit, hashes },
    null,
    2,
  ),
);
console.log(directory);
