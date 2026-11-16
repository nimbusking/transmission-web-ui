import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SESSION_FIELDS } from '../../src/services/session-fields';
import { SESSION_GROUPS } from '../../src/domain/settings-layout';
async function mock(page: Page, version = '4.1.4', rpc = 19, locale = 'en') {
  const session: Record<string, any> = {
    version,
    'rpc-version': rpc,
    'config-dir': '/config',
    'blocklist-size': 3,
  };
  for (const field of SESSION_FIELDS)
    if ((field.version ?? 16) <= rpc)
      session[field.key] =
        field.type === 'boolean'
          ? true
          : field.type === 'number'
            ? Math.max(field.min ?? 0, 100)
            : field.key === 'encryption'
              ? 'preferred'
              : '/data';
  session['alt-speed-time-begin'] = 540;
  session['alt-speed-time-end'] = 1020;
  session['alt-speed-time-day'] = 62;
  const writes: Record<string, unknown>[] = [],
    calls: string[] = [];
  let fail = false,
    failRead = false;
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body.method);
    if (body.method === 'session-get' && failRead) {
      await route.fulfill({ status: 503, body: 'disconnected' });
      return;
    }
    if (body.method === 'session-set') {
      if (fail) {
        fail = false;
        await route.fulfill({ status: 503, body: 'temporary' });
        return;
      }
      writes.push(body.arguments);
      Object.assign(session, body.arguments);
    }
    await route.fulfill({
      json: {
        result: 'success',
        tag: body.tag,
        arguments:
          body.method === 'session-get'
            ? session
            : body.method === 'torrent-get'
              ? { torrents: [] }
              : body.method === 'free-space'
                ? { 'size-bytes': 1234567 }
                : {},
      },
    });
  });
  await page.goto('/?lang=' + locale);
  await expect(page.locator('.connection')).toContainText(
    locale === 'zh-CN' ? '已连接' : 'Connected',
  );
  await page
    .getByRole('button', { name: locale === 'zh-CN' ? '设置' : 'Settings', exact: true })
    .click();
  return {
    writes,
    session,
    calls,
    failNext: () => {
      fail = true;
    },
    failSession: () => {
      failRead = true;
    },
  };
}
async function choose(page: Page, name: string) {
  await page.locator('.settings-dialog .n-tabs-tab').getByText(name, { exact: true }).click();
  await expect(page.locator('.settings-dialog .n-tabs-tab--active')).toHaveText(name);
}
async function upload(page: Page, input: string, raw: unknown) {
  await page.getByTestId(input).setInputFiles({
    name: 'settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(raw)),
  });
}
async function exportLabels(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export labels', exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
for (const [version, rpc] of [
  ['3.00', 16],
  ['4.0.0', 17],
  ['4.0.6', 17],
  ['4.1.4', 19],
] as const)
  test(`${version}: legacy categories cover all supported fields; save only changed values and retry failure`, async ({
    page,
  }) => {
    const state = await mock(page, version, rpc);
    await expect(page.locator('.settings-dialog .n-tabs-tab')).toHaveText([
      'Basic settings',
      'Network',
      'Bandwidth limits',
      'Schedule',
      'Folder dictionary',
      'Extra settings',
      'User labels',
    ]);
    for (const [group, name] of [
      ['basic', 'Basic settings'],
      ['network', 'Network'],
      ['bandwidth', 'Bandwidth limits'],
      ['schedule', 'Schedule'],
    ]) {
      await choose(page, name);
      await expect(page.locator('.n-tab-pane:visible [data-setting]')).toHaveCount(
        SESSION_GROUPS[group].filter((key) => Object.hasOwn(state.session, key)).length,
      );
    }
    await choose(page, 'Basic settings');
    await expect(
      page.getByRole('textbox', {
        name: 'Transmission configuration directory (read-only)',
        exact: true,
      }),
    ).toHaveValue('/config');
    await expect(
      page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
    ).toBeDisabled();
    const dir = page.locator('[data-setting="download-dir"] input');
    await dir.fill('/changed');
    state.failNext();
    await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
    await expect(page.locator('.n-alert').filter({ hasText: 'HTTP 503' })).toBeVisible();
    await expect(dir).toHaveValue('/changed');
    expect(state.writes).toEqual([]);
    await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes).toEqual([{ 'download-dir': '/changed' }]);
    const save = page.getByRole('button', { name: 'Save Transmission parameters', exact: true });
    await expect(save).toBeDisabled();
    await expect(page.locator('.settings-footer')).not.toContainText(
      'Unsaved Transmission changes',
    );
    await dir.fill('/changed-again');
    await save.click();
    await expect(save).toBeDisabled();
    expect(state.writes).toEqual([
      { 'download-dir': '/changed' },
      { 'download-dir': '/changed-again' },
    ]);
  });
test('automatic alternate mode follows server refresh without submitting or losing edits', async ({
  page,
}) => {
  await page.clock.install();
  const state = await mock(page);
  await page.locator('[data-setting="download-dir"] input').fill('/draft-kept');
  await choose(page, 'Schedule');
  const checkbox = page.locator('[data-setting="alt-speed-enabled"]').getByRole('checkbox');
  await expect(checkbox).toBeChecked();
  state.session['alt-speed-enabled'] = false;
  await page.clock.fastForward(31000);
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByTestId('schedule-live-state')).toContainText('normal speed limits');
  expect(state.writes).toEqual([]);
  await choose(page, 'Basic settings');
  await expect(page.locator('[data-setting="download-dir"] input')).toHaveValue('/draft-kept');
  await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toEqual({ 'download-dir': '/draft-kept' });
  await expect(
    page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
  ).toBeDisabled();
  await choose(page, 'Schedule');
  await checkbox.check();
  const reads = state.calls.filter((x) => x === 'session-get').length;
  await page.clock.fastForward(31000);
  await expect
    .poll(() => state.calls.filter((x) => x === 'session-get').length)
    .toBeGreaterThan(reads);
  await expect(checkbox).toBeChecked();
  await expect(page.getByTestId('schedule-live-state')).toContainText('normal speed limits');
  state.session['alt-speed-enabled'] = true;
  await page.clock.fastForward(31000);
  await expect(page.getByTestId('schedule-live-state')).toContainText('alternative speed limits');
  await expect(
    page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
  ).toBeDisabled();
  state.failSession();
  await page.clock.fastForward(31000);
  await expect(page.getByTestId('schedule-live-state')).toContainText('unavailable');
  expect(state.writes).toHaveLength(1);
});
test('server import updates the save baseline and subsequent save contains only new changes', async ({
  page,
}) => {
  const state = await mock(page);
  await page.getByRole('button', { name: 'Import and export', exact: true }).click();
  await upload(page, 'config-import', {
    format: 'transmission-web-ui',
    formatVersion: 1,
    sections: { server: { 'download-dir': '/imported-baseline' } },
  });
  await page
    .locator('.settings-transfer')
    .getByRole('checkbox', { name: 'Transmission parameters', exact: true })
    .last()
    .check();
  await page.getByRole('button', { name: /^Apply daemon changes/ }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await page.locator('.settings-transfer .n-base-close').click();
  const save = page.getByRole('button', { name: 'Save Transmission parameters', exact: true });
  await expect(save).toBeDisabled();
  await expect(page.locator('.settings-footer')).not.toContainText('Unsaved Transmission changes');
  await page.locator('[data-setting="download-dir"] input').fill('/after-import');
  await save.click();
  await expect(save).toBeDisabled();
  expect(state.writes).toEqual([
    { 'download-dir': '/imported-baseline' },
    { 'download-dir': '/after-import' },
  ]);
});
for (const [version, rpc] of [
  ['3.00', 16],
  ['4.0.0 (280ace12f8)', 17],
  ['4.0.6', 17],
  ['4.1.4', 19],
] as const)
  test(`${version}: uTP risk is version-specific and disabling only stages an explicit save`, async ({
    page,
  }) => {
    const state = await mock(page, version, rpc);
    for (const name of ['Network', 'Bandwidth limits', 'Schedule']) {
      await choose(page, name);
      if (!version.startsWith('4.0.0'))
        await expect(page.getByTestId('utp-limit-risk')).toHaveCount(0);
      else
        await expect(page.getByTestId('utp-limit-risk')).toContainText('may exceed speed limits');
    }
    if (!version.startsWith('4.0.0')) return;
    await page.getByRole('button', { name: 'Disable uTP (save to apply)', exact: true }).click();
    expect(state.writes).toEqual([]);
    await choose(page, 'Network');
    await expect(
      page.locator('[data-setting="utp-enabled"]').getByRole('checkbox'),
    ).not.toBeChecked();
    await expect(page.getByTestId('utp-limit-risk')).toBeVisible();
    await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save Transmission parameters', exact: true }),
    ).toBeDisabled();
    expect(state.writes).toEqual([{ 'utp-enabled': false }]);
    expect(state.calls.some((x) => x.startsWith('torrent-') && x !== 'torrent-get')).toBe(false);
    await expect(page.getByTestId('utp-limit-risk')).toHaveCount(0);
  });
test('Chinese dark narrow compatibility warning and live state keep controls reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await mock(page, '4.0.0', 17, 'zh-CN');
  await choose(page, '网络传输');
  await expect(page.getByTestId('utp-limit-risk')).toContainText('可能在保存后仍超出限速');
  await expect(
    page.getByRole('button', { name: '关闭 uTP（待保存）', exact: true }),
  ).toBeInViewport();
  await choose(page, '时段限制');
  await expect(page.getByTestId('schedule-live-state')).toContainText('备用限速');
  const bounds = await page
    .locator('.settings-dialog')
    .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await expect(page.getByRole('button', { name: '保存服务端参数', exact: true })).toBeInViewport();
  expect(state.writes).toEqual([]);
  await test.info().attach('settings-risk-dark-390.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
test('dependencies and schedule controls preserve exact HH:mm / weekday RPC values', async ({
  page,
}) => {
  const state = await mock(page);
  const incomplete = page.locator('[data-setting="incomplete-dir"] input');
  await page.locator('[data-setting="incomplete-dir-enabled"]').getByRole('checkbox').uncheck();
  await expect(incomplete).toBeDisabled();
  await choose(page, 'Schedule');
  const start = page.locator('[data-setting="alt-speed-time-begin"] input');
  await expect(start).toHaveValue('09:00');
  await start.fill('23:30');
  await start.press('Enter');
  await page.getByRole('checkbox', { name: 'Sunday', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Monday', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toEqual({
    'incomplete-dir-enabled': false,
    'alt-speed-time-begin': 1410,
    'alt-speed-time-day': 61,
  });
  await page.getByRole('checkbox', { name: 'Use schedule', exact: false }).uncheck();
  await expect(start).toBeDisabled();
});
test('label-only legacy import, rename, bulk deletion and export preserve remaining stable assignments', async ({
  page,
}) => {
  const state = await mock(page);
  await choose(page, 'User labels');
  const hash = 'a'.repeat(40);
  await upload(page, 'labels-import', {
    labels: [
      { name: 'First', color: '#112233' },
      { name: 'Second', color: '#223344' },
      { name: 'Third', color: '#334455' },
    ],
    maps: { [hash]: [0, 1, 2] },
  });
  await expect(page.locator('.import-preview')).toContainText('replaces all label definitions');
  await page.getByRole('button', { name: 'Import local data', exact: true }).click();
  await page.locator('.settings-transfer .n-base-close').click();
  await expect(page.locator('.settings-label-row')).toHaveCount(3);
  const before = await exportLabels(page),
    keep = before.sections.labels.definitions[2].id;
  await page
    .locator('.settings-label-row')
    .last()
    .getByPlaceholder('Label name', { exact: true })
    .fill('Renamed');
  await page
    .locator('.settings-label-row')
    .last()
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.locator('.n-message').last()).toContainText('Completed');
  await page.getByRole('checkbox', { name: 'Select label First', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select label Second', exact: true }).check();
  await page.getByRole('button', { name: /^Delete selected labels/ }).click();
  expect((await exportSettingsCount(page)).length).toBe(3);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.settings-label-row')).toHaveCount(1);
  const after = await exportLabels(page);
  expect(after.sections.labels.definitions).toEqual([
    { ...before.sections.labels.definitions[2], name: 'Renamed' },
  ]);
  expect(after.sections.labels.assignments[hash]).toEqual([keep]);
  expect(state.writes).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await choose(page, 'User labels');
  await expect(page.getByPlaceholder('Label name', { exact: true })).toHaveValue('Renamed');
});
async function exportSettingsCount(page: Page) {
  return page.locator('.settings-label-row').all();
}
test('categorized export and import apply only selected data; corrupt preview cannot apply an earlier file', async ({
  page,
}) => {
  const state = await mock(page);
  await page.getByRole('button', { name: 'Import and export', exact: true }).click();
  const panel = page.locator('.settings-transfer');
  const file = {
    format: 'transmission-web-ui',
    formatVersion: 1,
    sections: {
      folders: ['/selected'],
      labels: {
        definitions: [{ id: 'unused', name: 'Unused', color: '#123456' }],
        assignments: {},
      },
      server: { 'download-dir': '/never' },
    },
  };
  await upload(page, 'config-import', file);
  await panel
    .getByRole('checkbox', { name: 'Labels and assignments', exact: true })
    .last()
    .uncheck();
  expect(
    await panel
      .getByRole('checkbox', { name: 'Transmission parameters', exact: true })
      .last()
      .isChecked(),
  ).toBe(false);
  await page.getByRole('button', { name: 'Import local data', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected categories', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(exported.sections.folders).toEqual(['/selected']);
  expect(exported.sections.labels.definitions).toEqual([]);
  expect(exported.sections.server).toBeUndefined();
  expect(state.writes).toEqual([]);
  await upload(page, 'config-import', {
    format: 'transmission-web-ui',
    formatVersion: 999,
    sections: {},
  });
  await expect(panel.locator('.n-alert')).toContainText('Unsupported');
  await expect(panel.locator('.import-preview')).toHaveCount(0);
  await upload(page, 'config-import', file);
  await page.getByTestId('config-import').setInputFiles({
    name: 'corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(panel.locator('.n-alert')).toBeVisible();
  await expect(panel.locator('.import-preview')).toHaveCount(0);
});
test('settings are readable across skins and narrow layouts without implementing deferred extras', async ({
  page,
}) => {
  await mock(page);
  await choose(page, 'Extra settings');
  await expect(
    page.getByText('Right-click actions apply only to the clicked transfer', { exact: true }),
  ).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const name of [
      'Basic settings',
      'Network',
      'Bandwidth limits',
      'Schedule',
      'Folder dictionary',
      'Extra settings',
      'User labels',
    ]) {
      await choose(page, name);
      const dialog = page.locator('.settings-dialog');
      expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
      await expect(
        page.getByRole('button', { name: 'Import and export', exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
  }
});
for (const mode of ['light', 'dark'] as const)
  test(`${mode}: four visual skins and narrow settings preserve contrast and readable labels`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    const state = await mock(page);
    for (const skin of ['Modern', 'Metro', 'Material', 'Cupertino']) {
      await page.locator('.settings-dialog .n-base-close').click();
      await page.getByRole('button', { name: 'Visual themes', exact: true }).click();
      await page.getByRole('button', { name: skin, exact: true }).click();
      await expect(page.locator('.application')).toHaveAttribute(
        'data-visual-theme',
        skin.toLowerCase(),
      );
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await choose(page, 'Network');
        await expect(
          page.locator('[data-setting="download-queue-enabled"]').getByRole('checkbox'),
        ).toHaveAccessibleName('Enabled download queue, max queue number:');
        const label = page.locator('[data-setting="peer-port"] > label');
        await expect(label).toHaveCSS('font-size', '14px');
        expect(
          await page.locator('.settings-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
        ).toBeLessThanOrEqual(2);
        await expect(
          page.getByRole('button', { name: 'Import and export', exact: true }),
        ).toBeInViewport({ ratio: 1 });
        if (testInfo.project.name === 'chromium' && skin === 'Modern')
          await page.screenshot({
            path: `artifacts/settings-${mode}-${width}.png`,
            animations: 'disabled',
          });
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    expect(state.writes).toEqual([]);
  });

test('all short settings share label/control rows, pair enable switches, and retain wide text areas', async ({
  page,
}) => {
  const state = await mock(page),
    controlStarts: number[] = [];
  for (const [name, group] of [
    ['Basic settings', 'basic'],
    ['Network', 'network'],
    ['Bandwidth limits', 'bandwidth'],
    ['Schedule', 'schedule'],
  ]) {
    await choose(page, name);
    const metrics = await page.locator('.n-tab-pane:visible').evaluate((pane) =>
      [...pane.querySelectorAll<HTMLElement>('[data-setting]')].map((el) => {
        const control = el.querySelector<HTMLElement>(
          ':scope > .n-input-number, :scope > .n-select, :scope > .n-time-picker, :scope > .settings-weekdays',
        );
        const label =
          el.closest('.settings-row--paired')?.querySelector<HTMLElement>('.n-checkbox') ??
          el.querySelector<HTMLElement>(':scope > label');
        const a = label?.getBoundingClientRect(),
          b = control?.getBoundingClientRect();
        return {
          key: el.dataset.setting!,
          compact: el.classList.contains('settings-field--compact'),
          labelled: !!label,
          labelCenter: a ? a.y + a.height / 2 : null,
          controlCenter: b ? b.y + b.height / 2 : null,
          controlWidth: b?.width,
          controlLeft: b?.left,
          paired: !!el.closest('.settings-row--paired'),
        };
      }),
    );
    expect(metrics.map((x) => x.key)).toEqual(
      SESSION_GROUPS[group].filter((key) => Object.hasOwn(state.session, key)),
    );
    for (const item of metrics.filter((x) => x.compact)) {
      expect(item.labelled).toBe(true);
      expect(item.controlCenter).not.toBeNull();
      expect(Math.abs(item.labelCenter! - item.controlCenter!)).toBeLessThanOrEqual(1);
      if (item.controlLeft !== undefined) controlStarts.push(item.controlLeft);
      if (item.key !== 'alt-speed-time-day') expect(item.controlWidth).toBeLessThanOrEqual(221);
    }
    if (group === 'basic') {
      const long = page.locator('[data-setting="download-dir"]');
      const widths = await long.evaluate((el) => ({
        field: el.getBoundingClientRect().width,
        input: el.querySelector('.n-input')!.getBoundingClientRect().width,
      }));
      expect(widths.input).toBeGreaterThan(700);
      expect(Math.abs(widths.field - widths.input)).toBeLessThanOrEqual(1);
      for (const pref of ['locale', 'refreshIntervalMs', 'pageSize']) {
        const row = page.locator(`[data-preference="${pref}"]`);
        const shape = await row.evaluate((el) => {
          const c = el.querySelector('.n-input-number,.n-select')!.getBoundingClientRect(),
            r = el.getBoundingClientRect();
          return { width: c.width, height: r.height, controlHeight: c.height };
        });
        expect(shape.width).toBeLessThanOrEqual(221);
        expect(shape.height).toBeLessThanOrEqual(Math.max(45, shape.controlHeight + 2));
      }
    }
  }
  expect(Math.max(...controlStarts) - Math.min(...controlStarts)).toBeLessThanOrEqual(1);
  expect(state.writes).toEqual([]);
});

test('paired controls retain dependencies, visible units and large/decimal values in the minimal patch', async ({
  page,
}) => {
  const state = await mock(page);
  await choose(page, 'Network');
  const queue = page.locator('[data-setting="download-queue-size"] input');
  await page.locator('[data-setting="download-queue-enabled"]').getByRole('checkbox').uncheck();
  await expect(queue).toBeDisabled();
  await expect(queue).toHaveValue('100');
  await page.locator('[data-setting="download-queue-enabled"]').getByRole('checkbox').check();
  await queue.fill('12');
  await queue.press('Tab');
  await choose(page, 'Bandwidth limits');
  await expect(page.locator('[data-setting="speed-limit-down"] .settings-unit')).toHaveText('KB/s');
  await expect(page.locator('[data-setting="idle-seeding-limit"] .settings-unit')).toHaveText(
    /minutes/i,
  );
  const speed = page.locator('[data-setting="speed-limit-down"] input');
  await speed.fill('1234567');
  await speed.press('Tab');
  await expect(speed).toHaveValue('1234567');
  const ratio = page.locator('[data-setting="seedRatioLimit"] input');
  await ratio.fill('0.75');
  await ratio.press('Tab');
  await expect(ratio).toHaveValue('0.75');
  await page.getByRole('button', { name: 'Save Transmission parameters', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toEqual({
    'download-queue-size': 12,
    'speed-limit-down': 1234567,
    seedRatioLimit: 0.75,
  });
});

test('Chinese/English compact rows fit narrow screens and retain all seven categories', async ({
  page,
}, info) => {
  const state = await mock(page);
  for (const language of ['en', 'zh-CN']) {
    if (language === 'zh-CN') {
      await page.goto('/?lang=zh-CN');
      await page.getByRole('button', { name: '设置', exact: true }).click();
    }
    const names =
      language === 'en'
        ? [
            'Basic settings',
            'Network',
            'Bandwidth limits',
            'Schedule',
            'Folder dictionary',
            'Extra settings',
            'User labels',
          ]
        : ['基本设置', '网络传输', '带宽限制', '时段限制', '目录字典', '额外设置', '用户标签'];
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const [i, name] of names.entries()) {
        await choose(page, name);
        await expect
          .poll(() =>
            page.locator('.settings-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
          )
          .toBeLessThanOrEqual(2);
        if (i < 4) {
          const boxes = await page
            .locator('.n-tab-pane:visible .settings-field--compact:not(.settings-field--weekdays)')
            .evaluateAll((fields) =>
              fields.map((el) => {
                const c = el
                    .querySelector('.n-input-number,.n-select,.n-time-picker')!
                    .getBoundingClientRect(),
                  p = el.closest('.settings-row--paired'),
                  l = (p?.querySelector('.n-checkbox') ??
                    el.querySelector('label'))!.getBoundingClientRect();
                return {
                  overlap: l.right > c.left + 1,
                  center: Math.abs(l.y + l.height / 2 - c.y - c.height / 2),
                  width: c.width,
                };
              }),
            );
          for (const b of boxes) {
            expect(b.overlap).toBe(false);
            expect(b.center).toBeLessThanOrEqual(1);
            expect(b.width).toBeLessThanOrEqual(221);
          }
        }
        if (language === 'zh-CN' && info.project.name === 'chromium' && [0, 2].includes(i))
          await page.screenshot({
            path: `artifacts/settings-compact-${i === 0 ? 'basic' : 'bandwidth'}-${width}.png`,
            animations: 'disabled',
          });
      }
    }
  }
  expect(state.writes).toEqual([]);
});
