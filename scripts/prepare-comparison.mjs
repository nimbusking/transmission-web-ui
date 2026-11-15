import { createHash } from 'node:crypto';
import { readFile, writeFile, cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = '.lab/comparison',
  archive = 'artifacts/transmission-web-ui-2.0.0.tar.gz';
const bytes = await readFile(archive),
  sha256 = createHash('sha256').update(bytes).digest('hex');
if ((await readFile(`${archive}.sha256`, 'utf8')).split(/\s/)[0] !== sha256)
  throw new Error('Release checksum mismatch');
await mkdir(root, { recursive: true });
const staging = `${root}/.prepared`;
await rm(staging, { recursive: true, force: true });
await mkdir(staging);
execFileSync('tar', ['-xzf', archive, '-C', staging, 'web', 'SHA256SUMS']);
// Verify the published web snapshot against its manifest before serving it.
for (const line of (await readFile(`${staging}/SHA256SUMS`, 'utf8')).trim().split('\n')) {
  const [hash, path] = line.split(/\s+/);
  if (path.startsWith('web/')) {
    if (!/^web\/[A-Za-z0-9_./-]+$/.test(path) || path.split('/').includes('..'))
      throw new Error('Unsafe web manifest path');
    if (
      createHash('sha256')
        .update(await readFile(`${staging}/${path}`))
        .digest('hex') !== hash
    )
      throw new Error(`Invalid web resource: ${path}`);
  }
}
await rm(`${root}/modern-web`, { recursive: true, force: true });
await cp(`${staging}/web`, `${root}/modern-web`, { recursive: true });
await rm(staging, { recursive: true, force: true });
const deployment = {
  at: new Date().toISOString(),
  transmission: '4.1.4',
  release: '2.0.0',
  sha256,
  legacy: 'http://127.0.0.1:19080/transmission/web/',
  modern: 'http://127.0.0.1:19081/transmission/web/',
  sharedBackend: true,
  legacySource: 'old/src (read-only)',
  legacyConfiguration: 'all tasks, Chinese default, local automatic-update stub',
  modernSource: 'verified precompiled release snapshot (independent of subsequent dist rebuilds)',
};
await writeFile(`${root}/deployment.json`, JSON.stringify(deployment, null, 2));
console.log(JSON.stringify(deployment, null, 2));
