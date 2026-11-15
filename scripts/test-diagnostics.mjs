import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { transformWithEsbuild } from 'vite';
await mkdir('.lab/fixtures', { recursive: true });
await writeFile('.lab/fixtures/test.blocklist', 'twui-fixture:10.250.250.1-10.250.250.2\n');
execFileSync(
  'docker',
  [
    'compose',
    '-p',
    'twui-lab',
    '-f',
    'lab/compose.yaml',
    '--profile',
    'fixtures',
    'up',
    '-d',
    '--no-build',
    'fixture',
  ],
  { stdio: 'inherit' },
);
const { code } = await transformWithEsbuild(
  await readFile('src/services/rpc.ts', 'utf8'),
  'rpc.ts',
  { loader: 'ts', target: 'es2022' },
);
await writeFile('.lab/diagnostics-rpc.mjs', code);
const { RpcClient } = await import('../.lab/diagnostics-rpc.mjs'),
  results = [];
for (const port of [19091, 19092, 19093, 19095]) {
  const client = new RpcClient(`http://127.0.0.1:${port}/transmission/rpc`),
    original = await client.session();
  const patch = {
    'blocklist-enabled': original['blocklist-enabled'],
    'blocklist-url': original['blocklist-url'],
  };
  try {
    await client.call('session-set', {
      'blocklist-enabled': false,
      'blocklist-url': 'http://fixture:8080/files/test.blocklist',
    });
    const result = await client.call('blocklist-update', {}, { timeoutMs: 10000 });
    assert.ok(result['blocklist-size'] >= 1);
    const space = await client.call('free-space', { path: '/data' });
    assert.ok(space['size-bytes'] > 0);
    results.push({
      version: original.version,
      blocklistSize: result['blocklist-size'],
      freeSpaceBytes: space['size-bytes'],
      result: 'passed',
    });
  } finally {
    await client.call('session-set', patch);
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/diagnostics-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(results);
