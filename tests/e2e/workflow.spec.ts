import { expect, test } from '@playwright/test';

test('directory match survives dialog closure, keeps partial decisions and verifies restoration', async ({
  page,
}) => {
  const rows = [1, 2].map((id) => ({
    id,
    hashString: String(id).repeat(40),
    name: `Match ${id}`,
    downloadDir: '/original',
    status: 0,
    metadataPercentComplete: 1,
    recheckProgress: 1,
    files: [{ name: 'payload', length: 100, bytesCompleted: 100 }],
  }));
  const writes: any[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON(),
      ids = body.arguments.ids;
    const targets = Array.isArray(ids)
      ? rows.filter((row) => ids.includes(row.id) || ids.includes(row.hashString))
      : rows;
    if (body.method === 'torrent-set-location') {
      writes.push(body);
      for (const row of targets) row.downloadDir = body.arguments.location;
    }
    if (body.method === 'torrent-verify') {
      writes.push(body);
      for (const row of targets)
        row.files[0].bytesCompleted = row.id === 1 && row.downloadDir === '/candidate-a' ? 50 : 100;
    }
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.0.6', 'rpc-version': 17 }
            : body.method === 'torrent-get'
              ? { torrents: targets }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await page.getByRole('checkbox', { name: 'Select current page', exact: true }).check();
  await page.getByRole('button', { name: 'More ▾', exact: true }).click();
  await page.locator('.n-dropdown-menu').getByText('Find existing data', { exact: true }).click();
  await page
    .getByPlaceholder('Candidate directories, one per line')
    .fill('/candidate-a\n/candidate-b');
  await page.getByRole('button', { name: 'Start matching', exact: true }).click();
  await expect
    .poll(() => writes.filter((write) => write.method === 'torrent-verify').length)
    .toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.n-modal')).toHaveCount(0);
  await page.getByRole('button', { name: /^Find existing data/ }).click();
  const first = page.locator('.match-item').filter({ hasText: 'Match 1' }),
    second = page.locator('.match-item').filter({ hasText: 'Match 2' });
  await expect(first).toContainText('Partial match: choose next action');
  await expect(second).toContainText('Matched');
  await first.getByRole('button', { name: 'Try next directory', exact: true }).click();
  await expect(first).toContainText('Matched');
  await expect(first).toContainText('/candidate-b');
  await first
    .getByRole('button', { name: 'Restore original directory and verify', exact: true })
    .click();
  await expect(first).toContainText('Original directory restored and verified');
  expect(rows[0].downloadDir).toBe('/original');
  expect(writes.filter((write) => write.method === 'torrent-verify')).toHaveLength(4);
  expect(
    writes
      .filter((write) => write.method === 'torrent-set-location')
      .every((write) => write.arguments.move === false),
  ).toBe(true);
});
