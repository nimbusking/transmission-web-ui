import { expect, test } from '@playwright/test';
test('tree filters, counters, expansion persistence and statistics', async ({ page }) => {
  const rows = [
    {
      id: 1,
      name: 'First',
      hashString: 'a'.repeat(40),
      status: 0,
      totalSize: 100,
      downloadDir: '/data/a',
      trackers: [
        { id: 1, tier: 0, announce: 'http://tracker.local:8080/announce?key=secret' },
        { id: 2, tier: 0, announce: 'http://tracker.local:8080/other' },
      ],
    },
    {
      id: 2,
      name: 'Child',
      hashString: 'b'.repeat(40),
      status: 0,
      totalSize: 200,
      downloadDir: '/data/a/sub',
      trackers: [],
    },
    {
      id: 3,
      name: 'Boundary',
      hashString: 'c'.repeat(40),
      status: 4,
      totalSize: 300,
      downloadDir: '/data/abc',
      trackers: [],
    },
  ];
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? { torrents: rows }
              : b.method === 'session-stats'
                ? {
                    'cumulative-stats': {
                      uploadedBytes: 1024,
                      downloadedBytes: 2048,
                      filesAdded: 9,
                      sessionCount: 3,
                      secondsActive: 3600,
                    },
                    'current-stats': {
                      uploadedBytes: 0,
                      downloadedBytes: 0,
                      filesAdded: 1,
                      sessionCount: 1,
                      secondsActive: 10,
                    },
                  }
                : {},
        tag: b.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  const tree = page.getByRole('tree');
  await expect(tree).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All transfers', exact: true })).toBeVisible();
  await expect(tree).not.toContainText('Private');
  await expect(tree).not.toContainText('secret');
  await expect(
    tree
      .getByRole('treeitem')
      .filter({ has: page.getByRole('button', { name: 'All transfers 3', exact: true }) }),
  ).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Server distribution', 'Data directories', 'Statistics']) {
    await expect(
      tree.getByRole('treeitem').filter({ has: page.getByRole('button', { name, exact: true }) }),
    ).toHaveAttribute('aria-expanded', 'false');
  }
  await tree
    .getByRole('button', { name: 'Expand/collapse Server distribution', exact: true })
    .click();
  await tree.getByRole('button', { name: 'tracker.local:8080 1', exact: true }).click();
  await expect(page.locator('[data-torrent-id]')).toHaveCount(1);
  await tree.getByRole('button', { name: /^All transfers 3$/ }).click();
  await expect(page.locator('[data-torrent-id]')).toHaveCount(3);
  await tree.getByRole('button', { name: 'Expand/collapse Data directories', exact: true }).click();
  await tree.getByRole('button', { name: 'Expand/collapse /', exact: true }).click();
  await tree.getByRole('button', { name: 'Expand/collapse data', exact: true }).click();
  await tree.getByRole('button', { name: 'a 2', exact: true }).click();
  await expect(page.locator('[data-torrent-id]')).toHaveCount(2);
  await tree.getByRole('button', { name: 'Expand/collapse Statistics', exact: true }).click();
  await tree.getByRole('button', { name: 'Expand/collapse Cumulative', exact: true }).click();
  await tree
    .getByRole('button', { name: 'Expand/collapse Cumulative', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Uploaded' }).first()).toContainText(
    '1.0 KiB',
  );
  await tree.getByRole('button', { name: 'Expand/collapse Cumulative', exact: true }).click();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Cumulative' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.reload();
  await expect(tree).toBeVisible();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Cumulative' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.brand-flow')).toBeHidden();
});
test('large navigation stays virtual and keyboard can reach collapsed branches', async ({
  page,
}) => {
  const rows = Array.from({ length: 5000 }, (_, id) => ({
    id,
    name: `Scale ${id}`,
    hashString: id.toString(16).padStart(40, '0'),
    status: 0,
    totalSize: 1024,
    downloadDir: `/data/group-${id}/leaf`,
    trackers: [{ id: 0, tier: 0, announce: `http://tracker-${id}.local:8080/announce` }],
  }));
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    await route.fulfill({
      json: {
        result: 'success',
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? { torrents: rows }
              : {},
        tag: b.tag,
      },
    });
  });
  await page.goto('/?lang=en');
  const tree = page.getByRole('tree');
  await expect(page.getByText('5000 transfers').first()).toBeVisible();
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(70);
  const first = tree.getByRole('treeitem').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Downloading' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(70);
  await page.keyboard.press('ArrowLeft');
  await expect(
    tree.getByRole('treeitem').filter({ hasText: 'Server distribution' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(70);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Transmission WEB UI', exact: true }).click();
  await expect(tree).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
