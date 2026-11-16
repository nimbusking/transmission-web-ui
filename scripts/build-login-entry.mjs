import { mkdir, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = process.argv[2];
if (!output) throw new Error('Specify a new output directory');
await mkdir(output, { recursive: false });
await cp('dist', `${output}/web`, { recursive: true, filter: (p) => !p.endsWith('.map') });
for (const file of ['install-login-entry.sh', 'login-nginx.conf'])
  await cp(`release/${file}`, `${output}/${file}`);
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...(await files(`${dir}/${entry.name}`, `${name}/`)));
    else if (entry.isFile()) result.push(name);
    else throw new Error('Only regular files are allowed');
  }
  return result.sort();
}
const names = await files(output);
const bundles = await Promise.all(
  names.filter((n) => n.endsWith('.js')).map((n) => readFile(`${output}/${n}`, 'utf8')),
);
if (!bundles.some((s) => s.includes('login-page')))
  throw new Error('Built UI does not contain the login page; refusing stale release');
await writeFile(
  `${output}/SHA256SUMS`,
  (
    await Promise.all(
      names.map(
        async (name) =>
          `${createHash('sha256')
            .update(await readFile(`${output}/${name}`))
            .digest('hex')}  ${name}`,
      ),
    )
  ).join('\n') + '\n',
);
console.log(`Login entry bundle ready: ${output}`);
