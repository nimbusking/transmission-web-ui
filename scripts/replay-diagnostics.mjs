import { runReplay } from './lib/run-replay.mjs';
/* global window */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--candidate') options.candidate = true;
  else if (['--input', '--build', '--output', '--browser', '--assert'].includes(key) && args[i + 1])
    options[key.slice(2)] = args[++i];
  else throw new Error(`Unknown or missing argument: ${key}`);
}
if (!options.input || !options.build || !options.output || (options.candidate && !options.assert))
  throw new Error(
    'Usage: node scripts/replay-diagnostics.mjs --input <local.json> --build <replay-build> --output <directory> [--browser chromium|firefox|webkit] [--candidate --assert <expected.json>]',
  );
const root = await realpath(resolve(options.build));
if ((await stat(resolve(options.input))).size > 12 * 1024 * 1024)
  throw new Error('Input exceeds 12MiB');
const raw = await readFile(resolve(options.input), 'utf8');
if (Buffer.byteLength(raw) > 12 * 1024 * 1024) throw new Error('Input exceeds 12MiB');
const expected = options.assert
  ? JSON.parse(await readFile(resolve(options.assert), 'utf8'))
  : undefined;
if (
  options.candidate &&
  (!expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected) ||
    !Object.keys(expected).length ||
    Object.keys(expected).some(
      (key) =>
        ![
          'torrents',
          'selectedId',
          'stale',
          'ready',
          'generation',
          'authenticationRequired',
          'results',
          'detailId',
        ].includes(key),
    ))
)
  throw new Error('Candidate assertions must specify at least one supported state field');
const destination = resolve(options.output);
await mkdir(destination, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (
      request.method !== 'GET' ||
      !(pathname === '/replay.html' || pathname.startsWith('/assets/'))
    )
      throw new Error('Blocked resource');
    const path = await realpath(resolve(root, `.${pathname}`));
    if (!path.startsWith(root + sep)) throw new Error('Outside build directory');
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    };
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
let browser;
let report;
let blockedRequests = 0;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const engine = { chromium, firefox, webkit }[options.browser ?? 'chromium'];
  if (!engine) throw new Error('Unknown browser');
  browser = await engine.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.origin !== origin ||
      request.method() !== 'GET' ||
      !(url.pathname === '/replay.html' || url.pathname.startsWith('/assets/'))
    ) {
      blockedRequests++;
      await route.abort();
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${origin}/replay.html`);
  await page.waitForFunction(() => !!window.__replay);
  const timing = await page.evaluate(
    ({ raw, candidate, expected }) => window.__replay.prepare(raw, candidate, expected),
    { raw, candidate: !!options.candidate, expected },
  );
  report = await runReplay(page, timing);
  report.blockedRequests = blockedRequests;
  report.realRpcRequests = 0;
  if (blockedRequests) report.result = 'diverged';
  await page.screenshot({ path: resolve(destination, 'result.png'), fullPage: true });
} catch (error) {
  report = {
    result: 'ineligible',
    reason: error instanceof Error ? error.message : 'replay-failed',
    blockedRequests,
  };
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
await writeFile(resolve(destination, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(
  resolve(destination, 'events.jsonl'),
  (report.trace ?? []).map((event) => JSON.stringify(event)).join('\n'),
);
console.log(JSON.stringify({ result: report.result, report: resolve(destination, 'report.json') }));
if (report.result !== 'matched') process.exitCode = 1;
