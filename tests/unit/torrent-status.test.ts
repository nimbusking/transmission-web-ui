// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import TorrentTable from '../../src/components/TorrentTable.vue';
import { hasError, hasWarning } from '../../src/domain/navigation';
import { applyDelta, statusMatches } from '../../src/domain/torrents';
import type { Torrent } from '../../src/domain/types';

vi.mock('../../src/stores/app', () => ({
  useAppStore: () => ({
    settings: {
      ui: {
        columns: [
          { key: 'name', width: 300, visible: true },
          { key: 'percentDone', width: 120, visible: true },
        ],
      },
    },
    checkedIds: [],
  }),
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const failedTracker = {
  id: 0,
  announce: '',
  tier: 0,
  lastAnnounceTime: 1,
  lastAnnounceSucceeded: false,
};
const primaryCategories = ['paused', 'error', 'warning', 'checking', 'downloading', 'seeding'];

it.each([
  [undefined, false, false],
  [0, false, false],
  [1, false, true],
  [2, true, false],
  [3, true, false],
] as const)('classifies RPC error %s consistently', (error, isError, isWarning) => {
  const row = { id: 1, status: 0, error };
  expect(hasError(row)).toBe(isError);
  expect(hasWarning(row)).toBe(isWarning);
});

it.each([
  [0, 'paused', 'paused', 'paused', false],
  [1, 'checking', 'error', 'warning', false],
  [2, 'checking', 'error', 'warning', false],
  [3, 'downloading', 'error', 'warning', false],
  [4, 'downloading', 'error', 'warning', true],
  [5, 'seeding', 'error', 'warning', false],
  [6, 'seeding', 'error', 'warning', true],
  [7, undefined, 'error', 'warning', false],
  [undefined, undefined, 'error', 'warning', false],
] as const)(
  'assigns status %s to at most one primary category and requires a transferring status for activity',
  (status, cleanCategory, errorCategory, warningCategory, canTransfer) => {
    const failedAnnounce = { trackerStats: [failedTracker] };
    const cases: [Partial<Torrent>, string | undefined][] = [
      [{}, cleanCategory],
      [{ error: 0 }, cleanCategory],
      [{ error: 1 }, warningCategory],
      [{ error: 0, ...failedAnnounce }, warningCategory],
      [{ error: 2, ...failedAnnounce }, errorCategory],
      [{ error: 3 }, errorCategory],
    ];
    for (const [issue, expected] of cases) {
      const row = { id: 1, status, ...issue };
      expect(primaryCategories.filter((category) => statusMatches(row, category))).toEqual(
        expected ? [expected] : [],
      );
      expect(statusMatches(row, 'all')).toBe(true);
      expect(statusMatches(row, 'active')).toBe(false);
      expect(statusMatches({ ...row, rateDownload: 0, rateUpload: 0 }, 'active')).toBe(false);
      expect(statusMatches({ ...row, rateDownload: -1, rateUpload: Infinity }, 'active')).toBe(
        false,
      );
      expect(statusMatches({ ...row, rateDownload: 100 }, 'active')).toBe(canTransfer);
      expect(statusMatches({ ...row, rateUpload: 100 }, 'active')).toBe(canTransfer);
    }
  },
);

it('classifies failed announces as warnings, with errors taking precedence, and clears on recovery', () => {
  expect(hasWarning({ id: 1, error: 0, trackerStats: [failedTracker] })).toBe(true);
  for (const error of [2, 3]) {
    expect(hasWarning({ id: 1, error, trackerStats: [failedTracker] })).toBe(false);
  }
  expect(hasWarning({ id: 1, trackerStats: [{ ...failedTracker, lastAnnounceTime: 0 }] })).toBe(
    false,
  );
  const rows = new Map<number, Torrent>();
  applyDelta(rows, [{ id: 1, status: 4, error: 0, trackerStats: [failedTracker] }]);
  expect(statusMatches(rows.get(1)!, 'warning')).toBe(true);
  applyDelta(rows, [{ id: 1, trackerStats: [{ ...failedTracker, lastAnnounceSucceeded: true }] }]);
  expect(statusMatches(rows.get(1)!, 'warning')).toBe(false);
  expect(statusMatches(rows.get(1)!, 'downloading')).toBe(true);
});

function renderCells(row: Torrent) {
  const table = mount(TorrentTable, {
    props: { rows: [row], sortKey: 'name', descending: false },
    global: { stubs: { DataTable: true } },
  });
  const columns = table.findComponent({ name: 'DataTable' }).props('columns') as {
    key: string;
    render: (row: Torrent) => VNode;
  }[];
  const cells = mount({
    render: () =>
      h(
        'div',
        columns.filter((c) => ['name', 'percentDone'].includes(c.key)).map((c) => c.render(row)),
      ),
  });
  table.unmount();
  return cells;
}

it.each([1, 2, 3])(
  'keeps paused presentation separate from issue %s across a stop and recovery',
  (error) => {
    const rows = new Map<number, Torrent>();
    const issue = error === 1 ? 'warning' : 'error';
    applyDelta(rows, [
      { id: 1, status: 6, error, errorString: 'retained issue', percentDone: 1, rateUpload: 100 },
    ]);
    expect(statusMatches(rows.get(1)!, issue)).toBe(true);
    expect(statusMatches(rows.get(1)!, 'active')).toBe(true);
    applyDelta(rows, [{ id: 1, status: 0 }]);
    const row = rows.get(1)!;
    const cells = renderCells(row);
    expect(cells.find('[data-torrent-status="paused"]').exists()).toBe(true);
    expect(cells.find('[data-torrent-issue]').attributes('data-torrent-issue')).toBe(issue);
    expect(cells.find('.torrent-name-cell').attributes('title')).toContain('retained issue');
    expect(cells.find<HTMLElement>('.progress-fill').element.style.backgroundColor).toBe(
      'rgb(96, 133, 206)',
    );
    expect(primaryCategories.filter((category) => statusMatches(row, category))).toEqual([
      'paused',
    ]);
    expect(statusMatches(row, 'active')).toBe(false);
    cells.unmount();
    applyDelta(rows, [{ id: 1, status: 6 }]);
    expect(statusMatches(rows.get(1)!, issue)).toBe(true);
    applyDelta(rows, [{ id: 1, error: 0, errorString: '' }]);
    const recovered = renderCells(rows.get(1)!);
    expect(recovered.find('[data-torrent-issue]').exists()).toBe(false);
    expect(statusMatches(rows.get(1)!, issue)).toBe(false);
    expect(statusMatches(rows.get(1)!, 'seeding')).toBe(true);
    recovered.unmount();
  },
);

it.each([
  [1, 'rgb(181, 148, 91)'],
  [2, 'rgb(217, 119, 87)'],
  [3, 'rgb(217, 119, 87)'],
] as const)('uses distinct running progress colors for issue %s', (error, color) => {
  const cells = renderCells({ id: 1, status: 6, error, percentDone: 1 });
  expect(cells.find('[data-torrent-status="seeding"]').exists()).toBe(true);
  expect(cells.find<HTMLElement>('.progress-fill').element.style.backgroundColor).toBe(color);
  cells.unmount();
});
