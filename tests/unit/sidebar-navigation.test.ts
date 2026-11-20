// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import SidebarNavigation from '../../src/components/SidebarNavigation.vue';
import { defaultSettings, selectTorrents } from '../../src/domain/torrents';
import type { Torrent } from '../../src/domain/types';
import { zh } from '../../src/i18n/messages';

const torrents = ref<Torrent[]>([]);
vi.mock('../../src/stores/app', () => ({
  useAppStore: () => ({
    get torrents() {
      return torrents.value;
    },
    stats: {},
    settings: defaultSettings(),
  }),
}));

it('shows total, running and queued icon counts in one menu and refreshes them from torrent status', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } });
  const wrapper = mount(SidebarNavigation, {
    props: { status: 'all', folder: null, tracker: null, label: null },
    global: { plugins: [i18n] },
  });
  try {
    const downloadEntry = wrapper.get('[title="正在下载"]');
    const counters = () => downloadEntry.findAll('.tree-download-counts > span');
    const counts = () => counters().map((counter) => counter.text());
    expect(counts()).toEqual(['0', '0', '0']);
    for (const [index, icon] of ['list', 'arrow-down', 'clock-3'].entries()) {
      expect(counters()[index].get('svg').classes()).toContain(`lucide-${icon}`);
    }

    const downloads = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      status: index < 15 ? 4 : 3,
      rateDownload: 0,
    }));
    torrents.value = [
      ...downloads,
      { id: 31, status: 4, error: 2 },
      { id: 32, status: 3, error: 1 },
      { id: 33, status: 0 },
    ];
    await nextTick();
    expect(counts()).toEqual(['30', '15', '15']);
    const labels = ['共 30 项', '15 下载中', '15 排队'];
    expect(counters().map((counter) => counter.attributes('title'))).toEqual(labels);
    expect(counters().map((counter) => counter.attributes('aria-label'))).toEqual(labels);
    expect(downloadEntry.findAll('button')).toHaveLength(1);
    await downloadEntry.get('button').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['status', 'downloading']]);
    expect(
      selectTorrents(
        torrents.value,
        { status: 'downloading', search: '', sortKey: 'id', descending: false },
        defaultSettings(),
      ),
    ).toEqual(downloads);

    torrents.value = downloads.map((torrent) => ({ ...torrent, status: 4 }));
    await nextTick();
    expect(counts()).toEqual(['30', '30', '0']);
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});
