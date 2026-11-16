import { expect, test, type Page } from '@playwright/test';
import type { Torrent } from '../../src/domain/types';

const placeholder = 'Search names, separate keywords with spaces';
async function fixture(page: Page, rows: Torrent[]) {
  const calls: string[] = [];
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body.method);
    const ids = body.arguments.ids;
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? { version: '4.1.4', 'rpc-version': 19 }
            : body.method === 'torrent-get'
              ? {
                  torrents: Array.isArray(ids)
                    ? rows.filter((r) => ids.includes(r.id) || ids.includes(r.hashString))
                    : rows,
                }
              : {},
      },
    });
  });
  await page.goto('/?lang=en');
  await expect(page.locator('.connection')).toContainText('Connected');
  const automatic = page.getByRole('checkbox', { name: 'Automatic refresh', exact: true });
  if (await automatic.isChecked()) await automatic.click();
  await expect(automatic).not.toBeChecked();
  return calls;
}
const sampleRows = (): Torrent[] =>
  ['对照-C-部分数据', '三体.S01.1080p.WEB-DL', '三体.S02.2160p.BluRay', '符号[测试]+.*'].map(
    (name, index) => ({
      id: index + 1,
      name,
      hashString: (index + 10).toString(16).repeat(40),
      downloadDir: '/data/comparison/path-only',
      status: 0,
      queuePosition: index,
      percentDone: 0.5,
      trackers: [],
      files: [],
      peers: [],
    }),
  );

test('name-only partial and AND keywords, width/case normalization, literal punctuation and clearing', async ({
  page,
}) => {
  const calls = await fixture(page, sampleRows());
  const initialCalls = [...calls];
  const input = page.getByPlaceholder(placeholder);
  for (const [query, ids] of [
    ['C', [1]],
    ['comparison', []],
    ['a'.repeat(12), []],
    ['1080 三体', [2]],
    ['ＷＥＢ　ｓ０１ １０８０ 三体', [2]],
    ['三体 2160', [3]],
    ['三体 720', []],
    ['[测试] + .*', [4]],
    ['　 \t ', [1, 2, 3, 4]],
  ] as [string, number[]][]) {
    await input.fill(query);
    await expect(page.locator('.section-title')).toContainText(`${ids.length} transfers`);
    await expect(page.locator('[data-torrent-id]')).toHaveCount(ids.length);
    await expect
      .poll(() =>
        page
          .locator('[data-torrent-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-torrent-id')))),
      )
      .toEqual(ids);
  }
  await input.clear();
  await expect(page.locator('[data-torrent-id]')).toHaveCount(4);
  expect(calls).toEqual(initialCalls);
});

test('Chinese composition commits, rapid edits settle, and mobile Chinese copy stays usable', async ({
  page,
}, testInfo) => {
  await fixture(page, sampleRows());
  const input = page.getByPlaceholder(placeholder);
  await input.focus();
  await input.dispatchEvent('compositionstart');
  await input.evaluate((element: HTMLInputElement) => {
    element.value = '三体';
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: '三体', isComposing: true }),
    );
  });
  await page.waitForTimeout(160); // Exceed the 120ms debounce while the IME still owns the text.
  await expect(input).toHaveValue('三体');
  await expect(page.locator('[data-torrent-id]')).toHaveCount(4);
  await input.evaluate((element: HTMLInputElement) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '三体' })),
  );
  await expect(page.locator('[data-torrent-id]')).toHaveCount(2);
  await input.fill('no such name');
  await input.clear();
  await page.waitForTimeout(160); // A discarded pending query must not reappear after clearing.
  await expect(page.locator('[data-torrent-id]')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/?lang=zh-CN');
  const mobileInput = page.getByPlaceholder('搜索名称，空格分隔关键词');
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await mobileInput.fill('１０８０ 三体');
    await expect(page.locator('.mobile-transfer')).toHaveCount(1);
    await expect(page.locator('.mobile-transfer')).toContainText('三体.S01.1080p.WEB-DL');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`name-search-mobile-${mode}.png`) });
    await mobileInput.clear();
    await expect(page.locator('.mobile-transfer')).toHaveCount(4);
  }
});

test('search resets page/checks, preserves detail and intersects existing navigation filters', async ({
  page,
}) => {
  const rows: Torrent[] = Array.from({ length: 25 }, (_, index) => {
    const id = index + 1;
    return {
      id,
      name: `${id <= 12 ? 'Alpha.1080p' : 'Beta.2160p'}.Task ${String(id).padStart(2, '0')}`,
      hashString: id.toString(16).padStart(40, '0'),
      queuePosition: id,
      status: id >= 7 && id <= 12 ? 4 : 0,
      downloadDir: id <= 6 ? '/data/a' : '/data/b',
      trackers: id <= 3 ? [{ id: 0, tier: 0, announce: 'http://tracker.local:8080/announce' }] : [],
      files: [],
      peers: [],
      percentDone: 0.5,
    };
  });
  const calls = await fixture(page, rows);
  await page.locator('.list-footer .n-base-selection').click();
  await page.getByText('10 / page', { exact: true }).click();
  await page.locator('.n-pagination-quick-jumper input').fill('2');
  await page.locator('.n-pagination-quick-jumper input').press('Enter');
  await expect(page.locator('[data-torrent-id="11"]')).toBeVisible();
  await page.locator('[data-torrent-id="11"]').getByRole('checkbox').check();
  await page.locator('[data-torrent-id="11"] .torrent-name').click();
  await expect(page.locator('.detail-pane')).toContainText('Alpha.1080p.Task 11');
  const input = page.getByPlaceholder(placeholder);
  await input.fill('1080 alpha');
  await expect(page.locator('.list-footer')).toContainText('1–10 of 12');
  await expect(page.locator('.list-footer')).not.toContainText('selected');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await expect(page.locator('.detail-pane')).toContainText('Alpha.1080p.Task 11');
  const tree = page.getByRole('tree', { name: 'Navigation', exact: true });
  await tree.getByRole('button', { name: 'Paused 19', exact: true }).click();
  await expect(page.locator('.section-title')).toContainText('6 transfers');
  for (const name of [
    'Expand/collapse Data directories',
    'Expand/collapse /',
    'Expand/collapse data',
  ])
    await tree.getByRole('button', { name, exact: true }).click();
  await tree.getByRole('button', { name: 'a 6', exact: true }).click();
  await tree
    .getByRole('button', { name: 'Expand/collapse Server distribution', exact: true })
    .click();
  await tree.getByRole('button', { name: 'tracker.local:8080 3', exact: true }).click();
  await expect(page.locator('.section-title')).toContainText('3 transfers');
  await input.clear();
  await expect(page.locator('.section-title')).toContainText('3 transfers');
  await input.fill('beta 2160');
  await expect(page.locator('.section-title')).toContainText('0 transfers');
  await tree.getByRole('button', { name: 'All transfers 25', exact: true }).click();
  await expect(input).toHaveValue('beta 2160');
  await expect(page.locator('.section-title')).toContainText('13 transfers');
  expect(
    calls.filter((method) => !['session-get', 'session-stats', 'torrent-get'].includes(method)),
  ).toEqual([]);
});

test('5000 names stay virtualized; short filter-to-paint timing includes debounce', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'One bounded Chromium timing audit; behavior is tested in all three browsers.',
  );
  const rows: Torrent[] = Array.from({ length: 5000 }, (_, id) => ({
    id,
    name: `三体.S01.1080p.WEB-DL.${String(id).padStart(5, '0')}`,
    hashString: id.toString(16).padStart(40, '0'),
    downloadDir: '/data/comparison',
    status: 0,
    queuePosition: id,
    trackers: [],
  }));
  await fixture(page, rows);
  await expect(page.locator('.section-title')).toContainText('5000 transfers');
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    samples.push(
      await page.evaluate(
        async (query) => {
          const input = document.querySelector<HTMLInputElement>('.search-input input')!;
          const title = document.querySelector('.section-title')!;
          const expected = query ? '1 transfers' : '5000 transfers';
          const begin = performance.now();
          await new Promise<void>((resolve) => {
            const observer = new MutationObserver(() => {
              if (title.textContent!.includes(expected)) {
                observer.disconnect();
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
              }
            });
            observer.observe(title, { subtree: true, characterData: true, childList: true });
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          return performance.now() - begin;
        },
        i % 2 === 0 ? '04999 三体 １０８０' : '',
      ),
    );
  }
  const p95Ms = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
  await testInfo.attach('name-search-short-timing.json', {
    body: JSON.stringify({
      samples,
      p95Ms,
      scope:
        '5000 controlled rows; input event through two animation frames after filtered count; includes 120ms debounce; not 30-minute acceptance',
    }),
    contentType: 'application/json',
  });
  expect(p95Ms).toBeLessThan(1000);
  expect(await page.locator('[data-torrent-id]').count()).toBeLessThan(100);
});
