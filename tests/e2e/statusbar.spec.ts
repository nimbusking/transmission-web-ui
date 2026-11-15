import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const state = {
    download: 4096 as number | undefined,
    upload: 2048 as number | undefined,
    space: 1073741824 as number | undefined,
    spaceFail: false,
    offline: false,
    calls: [] as string[],
  };
  await page.route('**/app-config.json', (route) =>
    route.fulfill({ json: { rpcUrl: '../rpc', refreshIntervalMs: 2000 } }),
  );
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    state.calls.push(b.method);
    if (state.offline) return route.abort('failed');
    if (b.method === 'free-space') expect(b.arguments).toEqual({ path: '/data/default' });
    await route.fulfill({
      json: {
        tag: b.tag,
        result: b.method === 'free-space' && state.spaceFail ? 'path unavailable' : 'success',
        arguments:
          b.method === 'session-get'
            ? {
                version: '4.1.4 (actual-build)',
                'rpc-version': 19,
                'download-dir': '/data/default',
              }
            : b.method === 'session-stats'
              ? { downloadSpeed: state.download, uploadSpeed: state.upload }
              : b.method === 'free-space'
                ? { 'size-bytes': state.space }
                : {
                    torrents: [
                      {
                        id: 1,
                        hashString: '1'.repeat(40),
                        name: 'Status task',
                        status: 0,
                        downloadDir: '/data/task',
                        files: [],
                        trackers: [],
                        peers: [],
                      },
                    ],
                  },
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText('Connected');
  const automatic = page.getByRole('checkbox', { name: 'Automatic refresh', exact: true });
  await automatic.click();
  await expect(automatic).not.toBeChecked();
  return state;
}
async function refresh(page: Page) {
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
}
test('authoritative speed/space values, zero, unknown, disk failure/recovery, offline and manual refresh', async ({
  page,
}) => {
  const state = await fixture(page),
    bar = page.locator('.workspace-statusbar');
  await expect(bar.locator('.statusbar-download')).toContainText('4.0 KiB/s');
  await expect(bar.locator('.statusbar-upload')).toContainText('2.0 KiB/s');
  await expect(bar.locator('.statusbar-space')).toContainText('1.0 GiB');
  await expect(bar.locator('.statusbar-space')).toHaveAttribute('title', /\/data\/default/);
  await expect(page.locator('.topbar .connection,.topbar .speed,.sidebar-caption')).toHaveCount(0);
  await expect(bar).toContainText('Transmission Web UI 2.0.0');
  state.download = 0;
  state.upload = 0;
  state.space = 0;
  await refresh(page);
  await expect(bar.locator('.statusbar-download')).toContainText('0 B/s');
  await expect(bar.locator('.statusbar-space')).toContainText('0 B');
  state.download = undefined;
  state.upload = -1;
  state.space = undefined;
  await refresh(page);
  for (const cls of ['download', 'upload', 'space'])
    await expect(bar.locator(`.statusbar-${cls}`)).toContainText('Unavailable');
  state.download = 8192;
  state.spaceFail = true;
  await refresh(page);
  await expect(bar.locator('.statusbar-download')).toContainText('8.0 KiB/s');
  await expect(bar.locator('.connection')).toContainText('Connected');
  await expect(bar.locator('.statusbar-space')).toHaveAttribute('title', /path unavailable/);
  state.spaceFail = false;
  state.space = 2048;
  await refresh(page);
  await expect(bar.locator('.statusbar-space')).toContainText('2.0 KiB');
  const count = state.calls.length;
  await page.waitForTimeout(2300);
  expect(state.calls.length).toBe(count);
  state.offline = true;
  await refresh(page);
  await expect(bar.locator('.connection')).toContainText('Connection unavailable');
  await expect(bar.locator('.statusbar-stale')).toBeVisible();
  await expect(bar.locator('.statusbar-download')).toContainText('8.0 KiB/s');
  state.offline = false;
  await refresh(page);
  await expect(bar.locator('.connection')).toContainText('Connected');
  await expect(bar.locator('.statusbar-stale')).toHaveCount(0);
  expect(
    state.calls.every((m) =>
      ['session-get', 'session-stats', 'torrent-get', 'free-space'].includes(m),
    ),
  ).toBe(true);
});
test('every layout, skin and appearance reserves a full-width bottom row without covering controls', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await fixture(page);
  const metrics = [];
  for (const layout of ['Workbench', 'Console', 'Studio', 'Focus']) {
    await page.getByRole('button', { name: 'Layouts', exact: true }).click();
    await page.locator('.layout-dialog').getByRole('button', { name: layout, exact: true }).click();
    await page.keyboard.press('Escape');
    for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
      await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
      await page.locator('.theme-dialog').getByRole('button', { name: skin, exact: true }).click();
      await page.keyboard.press('Escape');
      for (const mode of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: mode as 'light' | 'dark' });
        if (mode === 'dark') await expect(page.locator('.application')).toHaveClass(/dark/);
        else await expect(page.locator('.application')).not.toHaveClass(/dark/);
        const g = await page.locator('.workspace-statusbar').evaluate((node) => {
          const b = node.getBoundingClientRect(),
            main = document.querySelector('.main-panel')!.getBoundingClientRect(),
            c = getComputedStyle(node),
            items = Array.from(node.querySelectorAll('.statusbar-item'))
              .slice(0, 3)
              .map((n) => ({
                icons: n.querySelectorAll('svg').length,
                border: getComputedStyle(n).borderLeftWidth,
              }));
          return {
            x: b.x,
            bottom: b.bottom,
            width: b.width,
            height: b.height,
            mainBottom: main.bottom,
            viewport: innerWidth,
            screenBottom: innerHeight,
            background: c.backgroundColor,
            color: c.color,
            items,
          };
        });
        expect(g.x).toBe(0);
        expect(g.width).toBe(g.viewport);
        expect(g.bottom).toBe(g.screenBottom);
        expect(g.height).toBe(32);
        expect(g.mainBottom).toBeLessThanOrEqual(g.bottom - g.height);
        expect(g.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(g.items.map((i) => i.icons)).toEqual([1, 1, 1]);
        expect(g.items[1].border).toBe('1px');
        metrics.push({ layout, skin, mode, ...g });
      }
    }
  }
  await info.attach('statusbar-geometry.json', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
});
test('narrow status strip scrolls internally and stays below navigation and task details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await fixture(page);
  const bar = page.locator('.workspace-statusbar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = (await bar.boundingBox())!;
  expect(box).toMatchObject({ x: 0, y: 768, width: 390, height: 32 });
  expect(await bar.evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  expect(
    (await page.locator('.sidebar').boundingBox())!.y +
      (await page.locator('.sidebar').boundingBox())!.height,
  ).toBeLessThanOrEqual(box.y);
  await page.locator('.navigation-scrim').click({ position: { x: 350, y: 10 } });
  await page.locator('.mobile-list').getByText('Status task', { exact: true }).click();
  await expect(page.locator('.detail-region')).toBeVisible();
  const detail = (await page.locator('.detail-region').boundingBox())!;
  expect(detail.y + detail.height).toBeLessThanOrEqual(box.y);
  await expect(bar.locator('.statusbar-download')).toBeVisible();
});
