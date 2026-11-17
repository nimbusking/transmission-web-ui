import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { offlineReplay } from '../helpers/diagnostics';

test('production UI records, downloads and replays a pause without developer capture hooks', async ({
  page,
  browser,
}, info) => {
  let status = 4;
  await page.route('**/rpc', (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-stop') status = 0;
    const row = {
      id: 1,
      hashString: 'a'.repeat(40),
      name: 'PRIVATE-production-task',
      downloadDir: '/PRIVATE/data',
      status,
      percentDone: 0.5,
      trackers: [],
      trackerStats: [],
      error: 0,
    };
    return route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    Object.fromEntries(
                      body.arguments.fields
                        .filter((key: string) => key in row)
                        .map((key: string) => [key, (row as any)[key]]),
                    ),
                  ],
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=zh-CN');
  await expect(page.getByLabel('用户名', { exact: true })).toBeEnabled();
  await page.getByLabel('用户名', { exact: true }).fill('CANARY');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await expect(page.locator('.workspace')).toBeVisible();
  await page.getByRole('button', { name: '关于', exact: true }).click();
  await page.locator('.diagnostics-panel summary').click();
  await page.getByRole('button', { name: '开始增强录制 / Record', exact: true }).click();
  await expect(page.locator('.diagnostics-panel [role=status]')).toContainText('正在录制');
  await page.keyboard.press('Escape');
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  const pause = page.getByRole('button', { name: '暂停', exact: true });
  await pause.click();
  await expect(pause).toBeEnabled();
  await page.getByRole('button', { name: '关于', exact: true }).click();
  await page.locator('.diagnostics-panel summary').click();
  await page.getByRole('button', { name: '停止并保存录制 / Stop', exact: true }).click();
  const exportButton = page.getByRole('button', { name: /^导出录制 / });
  await expect(exportButton).toContainText('replayable');
  const downloaded = page.waitForEvent('download');
  await exportButton.click();
  const raw = await readFile((await (await downloaded).path())!, 'utf8');
  expect(raw).not.toContain('PRIVATE');
  expect(raw).not.toContain('CANARY');
  const packet = JSON.parse(raw);
  await writeFile(`artifacts/diagnostics-replay/production-ui-${info.project.name}.json`, raw);
  const root = resolve('artifacts/replay-build');
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, 'http://localhost').pathname;
      if (pathname !== '/replay.html' && !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname))
        throw new Error('blocked');
      response.setHeader(
        'Content-Type',
        pathname.endsWith('.html')
          ? 'text/html'
          : pathname.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
      );
      response.end(await readFile(resolve(root, `.${pathname}`)));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const report = await offlineReplay(
      browser,
      packet,
      info,
      false,
      undefined,
      `http://127.0.0.1:${address.port}/replay.html`,
    );
    expect(report.actual.torrents[0].status).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
