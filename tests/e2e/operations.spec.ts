import { expect, test } from '@playwright/test';
import { fixture } from '../fixtures/torrent.mjs';
test('mixed URL/file queue settles errors, reports duplicates and handles drag/drop', async ({
  page,
}) => {
  const data = fixture('Browser added transfer'),
    rows: any[] = [],
    writes: any[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    let args: any = {};
    if (body.method === 'session-get')
      args = { version: '4.0.6', 'rpc-version': 17, 'download-dir': '/default' };
    if (body.method === 'torrent-get') args = { torrents: rows };
    if (body.method === 'torrent-add') {
      writes.push(body);
      if (body.arguments.metainfo === Buffer.from('invalid').toString('base64')) {
        await route.fulfill({ json: { result: 'invalid metainfo', tag: body.tag } });
        return;
      }
      const hash = body.arguments.metainfo
        ? 'a'.repeat(40)
        : body.arguments.filename.startsWith('magnet:')
          ? 'b'.repeat(40)
          : 'c'.repeat(40);
      const old = rows.find((row) => row.hashString === hash);
      if (old) args = { 'torrent-duplicate': old };
      else {
        const row = {
          id: rows.length + 1,
          hashString: hash,
          name: body.arguments.metainfo ? 'Browser added transfer' : body.arguments.filename,
          downloadDir: body.arguments['download-dir'],
          status: 0,
        };
        rows.push(row);
        args = { 'torrent-added': row };
      }
    }
    await route.fulfill({ json: { result: 'success', arguments: args, tag: body.tag } });
  });
  await page.goto('/?lang=en');
  await page.locator('.toolbar').getByRole('button', { name: 'Add transfer', exact: true }).click();
  await page
    .getByPlaceholder('One link per line')
    .fill(`magnet:?xt=urn:btih:${'b'.repeat(40)}\nhttps://example.invalid/fixture.torrent\n`);
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'invalid.torrent',
      mimeType: 'application/x-bittorrent',
      buffer: Buffer.from('invalid'),
    },
    {
      name: 'valid.torrent',
      mimeType: 'application/x-bittorrent',
      buffer: Buffer.from(data.metainfo, 'base64'),
    },
  ]);
  await page.getByRole('dialog').getByRole('button', { name: 'Add transfer', exact: true }).click();
  await expect(page.locator('.result-row')).toContainText(['invalid metainfo']);
  await expect(page.locator('[data-torrent-id]')).toHaveCount(3);
  expect(writes).toHaveLength(4);
  expect(writes.every((write) => write.arguments.paused === true)).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(({ metainfo }) => {
    const transfer = new DataTransfer(),
      bytes = Uint8Array.from(atob(metainfo), (character) => character.charCodeAt(0));
    transfer.items.add(
      new File([bytes], 'duplicate.torrent', { type: 'application/x-bittorrent' }),
    );
    document
      .querySelector('.workspace')!
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
  }, data);
  await page.getByRole('dialog').getByRole('button', { name: 'Add transfer', exact: true }).click();
  await expect(page.locator('.result-row')).toContainText(['Already exists']);
  expect(rows).toHaveLength(3);
});
test('task identity changes during confirmation reject deletion', async ({ page }) => {
  let hash = 'a'.repeat(40),
    removes = 0;
  await page.route('**/app-config.json', (route) =>
    route.fulfill({ json: { rpcUrl: '../rpc', refreshIntervalMs: 2000 } }),
  );
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-remove') removes++;
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? {
                  torrents: [
                    {
                      id: 1,
                      hashString: hash,
                      name: 'Identity task',
                      downloadDir: '/data',
                      status: 0,
                    },
                  ],
                }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  await page.locator('[data-torrent-id="1"] .torrent-name').click();
  await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  hash = 'b'.repeat(40);
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.n-modal')).toContainText('Task identity changed');
  expect(removes).toBe(0);
});

test('cancelling a sequential batch leaves submitted command intact and skips the rest', async ({
  page,
}) => {
  const rows = [1, 2, 3].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Cancel ${id}`,
    downloadDir: '/data',
    status: 0,
  }));
  let release!: () => void,
    submitted = 0;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    if (body.method === 'torrent-verify') {
      submitted++;
      await gate;
    }
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: rows }
              : {},
        tag: body.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check();
  await page.locator('.toolbar').getByRole('button', { name: 'Verify data', exact: true }).click();
  expect(submitted).toBe(0);
  await page.getByRole('button', { name: 'Start verification', exact: true }).click();
  await expect.poll(() => submitted).toBe(1);
  await expect(
    page.locator('.toolbar').getByRole('button', { name: 'Start', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel pending items', exact: true })
    .click();
  release();
  await expect(page.getByRole('dialog')).toContainText('Cancelled');
  await expect(page.getByRole('dialog')).toContainText('Cancel 1');
  await expect(page.getByRole('dialog')).toContainText('Cancel 2: Cancelled');
  await expect(page.getByRole('dialog')).toContainText('Cancel 3: Cancelled');
  await expect(page.getByRole('dialog')).not.toContainText('undefined');
  await expect(
    page.getByRole('button', { name: 'Start verification', exact: true }),
  ).toBeDisabled();
  expect(submitted).toBe(1);
});
