import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const { version: uiVersion } = JSON.parse(await readFile('package.json', 'utf8'));
const args = process.argv.slice(2);
let version = uiVersion,
  outputDirectory = 'artifacts',
  webDirectory = 'dist';
for (let i = 0; i < args.length; i += 2) {
  if (!args[i + 1]) throw new Error('Missing release argument');
  if (args[i] === '--version') version = args[i + 1];
  else if (args[i] === '--output-dir') outputDirectory = args[i + 1];
  else if (args[i] === '--web-dir') webDirectory = args[i + 1];
  else throw new Error(`Unknown release argument: ${args[i]}`);
}
const output = path.resolve(root, outputDirectory);
await mkdir(output, { recursive: true });
execFileSync(process.execPath, ['scripts/build-installer.mjs'], { stdio: 'inherit' });
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error('Invalid release version');
const stage = path.join(output, `stage-${version}`);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(webDirectory, path.join(stage, 'web'), {
  recursive: true,
  filter: (source) => !source.endsWith('.map'),
});
await cp('LICENSE', path.join(stage, 'LICENSE'));
await cp('release/install.sh', path.join(stage, 'install.sh'));
await cp(
  'release/install-transmission-web-ui.sh',
  path.join(stage, 'install-transmission-web-ui.sh'),
);
await cp('release/synology-check.sh', path.join(stage, 'synology-check.sh'));
await cp('release/synocommunity.sh', path.join(stage, 'synocommunity.sh'));
await mkdir(path.join(stage, 'docs'));
for (const name of ['deployment.md', 'migration.md', 'synology.md', 'integrated-installer.md'])
  await cp(path.join('docs', name), path.join(stage, 'docs', name));
await writeFile(path.join(stage, 'VERSION'), `${version}\n`);
await writeFile(
  path.join(stage, 'manifest.json'),
  JSON.stringify(
    {
      name: 'transmission-web-ui',
      version,
      uiVersion,
      installer: { entry: 'install-transmission-web-ui.sh', format: 1 },
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
const archive = path.join(output, `transmission-web-ui-${version}.tar.gz`);
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
await cp('release/install.sh', path.join(output, 'install.sh'));
await cp('release/synology-check.sh', path.join(output, 'synology-check.sh'));
await cp('release/synocommunity.sh', path.join(output, 'synocommunity.sh'));
await cp(
  'release/install-transmission-web-ui.sh',
  path.join(output, 'install-transmission-web-ui.sh'),
);
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await cp(archive, path.join(output, 'transmission-web-ui.tar.gz'));
await writeFile(
  path.join(output, 'transmission-web-ui.tar.gz.sha256'),
  `${digest}  transmission-web-ui.tar.gz\n`,
);
// The downloadable single script carries this exact verified archive. The archive
// itself includes the small source installer, so there is no recursive packaging.
const payload = (await readFile(archive))
  .toString('base64')
  .match(/.{1,76}/g)
  .join('\n');
const embedded = `extract_bundled_release() {\ncat <<'TWUI_RELEASE_BASE64_END' | base64 -d > "$work/release.tar.gz"\n${payload}\nTWUI_RELEASE_BASE64_END\narchive=$work/release.tar.gz\n[ -n "$expected" ] || expected=${digest}\n}\n`;
const launcher = await readFile('release/install-transmission-web-ui.sh', 'utf8');
const bundled = launcher.replace('#!/bin/sh\n', `#!/bin/sh\n${embedded}`);
await writeFile(path.join(output, 'install-transmission-web-ui.sh'), bundled, { mode: 0o755 });
await writeFile(
  path.join(output, 'install-transmission-web-ui.sh.sha256'),
  `${createHash('sha256').update(bundled).digest('hex')}  install-transmission-web-ui.sh\n`,
);
console.log(`Release ready: ${archive}`);
