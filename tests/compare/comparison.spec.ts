import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { RpcClient } from '../../src/services/rpc';
test('both UI snapshots load the same real 4.1.4 tasks and share start/pause state', async ({
  context,
  browserName,
}) => {
  test.setTimeout(60000);
  const seed = JSON.parse(await readFile('.lab/comparison/seed.json', 'utf8')),
    target = seed.tasks.find((item: any) => item.directory.endsWith('/empty')),
    legacy = await context.newPage(),
    modern = await context.newPage(),
    errors: string[] = [];
  legacy.on('pageerror', (error) => errors.push(`legacy: ${error.message}`));
  modern.on('pageerror', (error) => errors.push(`modern: ${error.message}`));
  await Promise.all([
    legacy.goto('http://127.0.0.1:19080/transmission/web/?lang=en'),
    modern.goto('http://127.0.0.1:19081/transmission/web/?lang=en'),
  ]);
  await expect(legacy.locator('#status_version')).toContainText('4.1.4');
  await expect(modern.locator('.connection')).toContainText('Connected');
  const rpc = new RpcClient('http://127.0.0.1:19081/transmission/rpc'),
    live = (await rpc.torrents(['id', 'hashString'], [target.hash])).torrents[0];
  const oldName = legacy.getByText(target.name, { exact: true }).first(),
    newRow = modern.locator(`[data-torrent-id="${live.id}"]`);
  await expect(oldName).toBeVisible();
  await expect(newRow).toContainText(target.name);
  try {
    await newRow.locator('.torrent-name').click();
    await modern.getByRole('button', { name: '▷ Start', exact: true }).click();
    await expect(newRow).toContainText('Downloading');
    await expect(oldName.locator('xpath=ancestor::tr[1]')).toContainText('Downloading', {
      timeout: 15000,
    });
    await oldName.click();
    await oldName.locator('xpath=ancestor::tr[1]').getByRole('checkbox').check();
    await expect(legacy.locator('#toolbar_pause')).not.toHaveClass(/l-btn-disabled/);
    await legacy.locator('#toolbar_pause').click();
    await expect(newRow).toContainText('Paused', { timeout: 15000 });
    await expect(oldName.locator('xpath=ancestor::tr[1]')).toContainText('Paused', {
      timeout: 15000,
    });
    await expect(legacy.locator('#status_version')).toContainText('RPC: 19');
    expect(errors).toEqual([]);
    await legacy.screenshot({
      path: `artifacts/comparison-legacy-${browserName}.png`,
      fullPage: true,
    });
    await modern.screenshot({
      path: `artifacts/comparison-modern-${browserName}.png`,
      fullPage: true,
    });
  } finally {
    await rpc.call('torrent-stop', { ids: [target.hash] });
  }
});
