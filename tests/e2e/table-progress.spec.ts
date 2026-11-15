import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const rows = [
    { id: 1, percentDone: 0, status: 0 },
    { id: 2, percentDone: 0.5, status: 4 },
    { id: 3, percentDone: 1, status: 6 },
    { id: 4, percentDone: 0.9, recheckProgress: 0.25, status: 2 },
    { id: 5, status: 0 },
    { id: 6, percentDone: 0.125, status: 0, error: 3 },
  ].map((row) => ({
    ...row,
    name: `Progress ${row.id}`,
    hashString: String(row.id).repeat(40),
    downloadDir: '/data',
    trackers: [],
  }));
  const writes: string[] = [];
  await page.route('**/rpc', async (route) => {
    const b = route.request().postDataJSON();
    if (!['session-get', 'session-stats', 'torrent-get'].includes(b.method)) writes.push(b.method);
    await route.fulfill({
      json: {
        result: 'success',
        tag: b.tag,
        arguments:
          b.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : b.method === 'torrent-get'
              ? { torrents: rows }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('[data-torrent-id="1"]')).toBeVisible();
  return writes;
}
for (const theme of ['light', 'dark'] as const)
  test(`${theme}: rectangular progress fills column and keeps labels, semantics and row selection`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const writes = await fixture(page);
    const bar = (id: number) => page.locator(`[data-torrent-id="${id}"] .progress-cell`);
    for (const [id, value, text] of [
      [1, 0, '0.00%'],
      [2, 50, '50.00%'],
      [3, 100, '100.00%'],
      [4, 25, '25.00%'],
      [6, 12.5, '12.50%'],
    ] as const) {
      await expect(bar(id)).toHaveText(text);
      await expect(bar(id)).toHaveAttribute('aria-valuenow', String(value));
      await expect(bar(id).locator('.progress-fill')).toHaveAttribute(
        'style',
        new RegExp(`width: ${value}%`),
      );
    }
    await expect(bar(5)).toHaveText('—');
    await expect(bar(5)).not.toHaveAttribute('aria-valuenow');
    await expect(bar(4)).toHaveAttribute('aria-valuetext', 'Verification 25.00%');
    await expect(bar(4)).toHaveAttribute('title', /Verification 25.00%.*90.00%/);
    const geometry = () =>
      bar(3).evaluate((node) => {
        const r = node.getBoundingClientRect(),
          td = node.closest('td')!,
          t = td.getBoundingClientRect(),
          label = node.querySelector('.progress-label')!,
          text = document.createRange();
        text.selectNodeContents(label);
        const l = text.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          available:
            td.clientWidth -
            parseFloat(getComputedStyle(td).paddingLeft) -
            parseFloat(getComputedStyle(td).paddingRight),
          labelCenter: l.x + l.width / 2,
          center: r.x + r.width / 2,
          textFits: l.width <= r.width - 2,
          borderRadius: getComputedStyle(node).borderRadius,
          rowHeight: node.closest('tr')!.getBoundingClientRect().height,
          textColor: getComputedStyle(label).color,
          themeText: getComputedStyle(node).getPropertyValue('--text').trim(),
          fillFraction:
            node.querySelector('.progress-fill')!.getBoundingClientRect().width / node.clientWidth,
          withinColumn: r.x >= t.x && r.right <= t.right,
        };
      });
    const initial = await geometry();
    expect(initial.height).toBe(20);
    expect(initial.width).toBeCloseTo(initial.available, 0);
    expect(initial.borderRadius).toBe('0px');
    // Current Naive UI rows measure 35px; the virtual row configuration is 32px.
    // This appearance change must not make the existing rendered row taller.
    expect(initial.rowHeight).toBeLessThanOrEqual(35);
    expect(initial.labelCenter).toBeCloseTo(initial.center, 0);
    expect(initial.fillFraction).toBeCloseTo(1, 2);
    expect(initial.textFits).toBe(true);
    expect(initial.withinColumn).toBe(true);
    if (theme === 'dark') await expect(page.locator('.application')).toHaveClass(/dark/);
    else await expect(page.locator('.application')).not.toHaveClass(/dark/);
    const resize = async (delta: number) => {
      const handle = page.getByRole('separator', { name: 'Width Progress', exact: true }),
        box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2);
      await page.mouse.up();
    };
    await resize(160);
    await expect.poll(async () => (await geometry()).width).toBeGreaterThan(initial.width + 140);
    const expanded = await geometry();
    expect(expanded.width).toBeCloseTo(expanded.available, 0);
    expect(expanded.labelCenter).toBeCloseTo(expanded.center, 0);
    await resize(-1000);
    await expect.poll(async () => (await geometry()).width).toBeLessThan(60);
    const narrow = await geometry();
    expect(narrow.textFits).toBe(true);
    expect(narrow.withinColumn).toBe(true);
    expect(narrow.rowHeight).toBeLessThanOrEqual(35);
    await page.locator('[data-torrent-id="1"]').getByRole('checkbox').check();
    await bar(2).click();
    await expect(page.locator('.detail-header')).toContainText('Progress 2');
    await expect(page.locator('[data-torrent-id="1"]').getByRole('checkbox')).toBeChecked();
    expect(writes).toEqual([]);
  });
