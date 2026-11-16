import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    lib: { entry: 'src/services/session-fields.ts', formats: ['es'], fileName: 'fields' },
    outDir: '.lab/settings-model',
    emptyOutDir: true,
  },
});
const { SESSION_FIELDS } = await import('../.lab/settings-model/fields.js');
const script = await readFile('tests/fixtures/settings-rpc.py', 'utf8'),
  results = [];
for (const version of ['3.00', '4.0.0', '4.0.6', '4.1.4']) {
  const name = `twui-settings-check-${version.replaceAll('.', '-')}-${Date.now()}`;
  let started = false;
  try {
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        name,
        '--network',
        'none',
        '--tmpfs',
        '/config',
        '--tmpfs',
        '/data',
        '-e',
        'OPENSSL_CONF=/openssl-3-legacy.cnf',
        '-v',
        `${process.cwd()}/lab/openssl-3-legacy.cnf:/openssl-3-legacy.cnf:ro`,
        `twui-lab/transmission:${version}`,
      ],
      { stdio: 'pipe' },
    );
    started = true;
    const result = JSON.parse(
      execFileSync(
        'docker',
        ['exec', name, 'python3', '-c', script, JSON.stringify(SESSION_FIELDS)],
        { encoding: 'utf8', timeout: 30000 },
      ),
    );
    results.push(result);
    console.log(`${version}: ${result.changedFields.length} fields saved/read back`);
  } finally {
    if (started) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
  }
}
await writeFile(
  'artifacts/settings-compatibility.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      isolatedTemporaryContainers: true,
      network: 'none',
      comparisonEnvironmentTouched: false,
      results,
    },
    null,
    2,
  ) + '\n',
);
