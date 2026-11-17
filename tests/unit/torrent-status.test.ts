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
  expect(statusMatches(row, 'error')).toBe(isError);
  expect(statusMatches(row, 'warning')).toBe(isWarning);
  expect(statusMatches(row, 'paused')).toBe(true);
});

it('classifies failed announces as warnings, with errors taking precedence, and clears on recovery', () => {
  expect(hasWarning({ id: 1, error: 0, trackerStats: [failedTracker] })).toBe(true);
  for (const error of [2, 3]) {
    expect(hasWarning({ id: 1, error, trackerStats: [failedTracker] })).toBe(false);
  }
  expect(hasWarning({ id: 1, trackerStats: [{ ...failedTracker, lastAnnounceTime: 0 }] })).toBe(
    false,
  );
  const rows = new Map<number, Torrent>();
  applyDelta(rows, [{ id: 1, error: 0, trackerStats: [failedTracker] }]);
  applyDelta(rows, [{ id: 1, trackerStats: [{ ...failedTracker, lastAnnounceSucceeded: true }] }]);
  expect(statusMatches(rows.get(1)!, 'warning')).toBe(false);
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
    applyDelta(rows, [{ id: 1, status: 6, error, errorString: 'retained issue', percentDone: 1 }]);
    applyDelta(rows, [{ id: 1, status: 0 }]);
    const row = rows.get(1)!;
    const cells = renderCells(row);
    expect(cells.find('[data-torrent-status="paused"]').exists()).toBe(true);
    expect(cells.find('[data-torrent-issue]').attributes('data-torrent-issue')).toBe(
      error === 1 ? 'warning' : 'error',
    );
    expect(cells.find('.torrent-name-cell').attributes('title')).toContain('retained issue');
    expect(cells.find<HTMLElement>('.progress-fill').element.style.backgroundColor).toBe(
      'rgb(96, 133, 206)',
    );
    expect(statusMatches(row, 'error')).toBe(error !== 1);
    cells.unmount();
    applyDelta(rows, [{ id: 1, error: 0, errorString: '' }]);
    const recovered = renderCells(rows.get(1)!);
    expect(recovered.find('[data-torrent-issue]').exists()).toBe(false);
    expect(statusMatches(rows.get(1)!, 'error')).toBe(false);
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
