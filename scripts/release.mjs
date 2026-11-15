import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error('Invalid release version');
const stage = path.join(root, 'artifacts', `stage-${version}`);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp('dist', path.join(stage, 'web'), {
  recursive: true,
  filter: (source) => !source.endsWith('.map'),
});
await cp('LICENSE', path.join(stage, 'LICENSE'));
await cp('release/install.sh', path.join(stage, 'install.sh'));
await cp('release/synology-check.sh', path.join(stage, 'synology-check.sh'));
await cp('release/synocommunity.sh', path.join(stage, 'synocommunity.sh'));
await mkdir(path.join(stage, 'docs'));
for (const name of ['deployment.md', 'migration.md', 'synology.md'])
  await cp(path.join('docs', name), path.join(stage, 'docs', name));
await writeFile(path.join(stage, 'VERSION'), `${version}\n`);
await writeFile(
  path.join(stage, 'manifest.json'),
  JSON.stringify(
    {
      name: 'transmission-web-ui',
      version,
      format: 1,
      webRoot: 'web',
      transmission: ['3.00', '4.0.x', '4.1.4'],
      runtime: 'static',
      requires: ['POSIX sh', 'tar', 'sha256sum', 'standard file utilities'],
      developmentRuntimesRequired: false,
      synocommunity: {
        version: '4.1.4-32',
        adapter: 'synocommunity.sh',
        deviceValidation: 'pending',
      },
    },
    null,
    2,
  ) + '\n',
);
async function files(directory, base = '') {
  const out = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = base ? `${base}/${item.name}` : item.name;
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative))
      throw new Error(`Unsupported archive filename: ${relative}`);
    if (item.isDirectory()) out.push(...(await files(path.join(directory, item.name), relative)));
    else if (item.isFile()) out.push(relative);
    else throw new Error('Release cannot contain symlinks');
  }
  return out.sort();
}
const names = await files(stage);
const sums = await Promise.all(
  names.map(
    async (name) =>
      `${createHash('sha256')
        .update(await readFile(path.join(stage, name)))
        .digest('hex')}  ${name}`,
  ),
);
await writeFile(path.join(stage, 'SHA256SUMS'), sums.join('\n') + '\n');
const archive = path.join(root, 'artifacts', `transmission-web-ui-${version}.tar.gz`);
execFileSync('tar', [
  '--sort=name',
  '--mtime=@0',
  '--owner=0',
  '--group=0',
  '--numeric-owner',
  '-czf',
  archive,
  '-C',
  stage,
  ...(await readdir(stage)),
]);
await writeFile(
  `${archive}.sha256`,
  `${createHash('sha256')
    .update(await readFile(archive))
    .digest('hex')}  ${path.basename(archive)}\n`,
);
await cp('release/install.sh', path.join(root, 'artifacts', 'install.sh'));
await cp('release/synology-check.sh', path.join(root, 'artifacts', 'synology-check.sh'));
await cp('release/synocommunity.sh', path.join(root, 'artifacts', 'synocommunity.sh'));
console.log(`Release ready: ${archive}`);
