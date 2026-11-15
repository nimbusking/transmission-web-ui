import type { MatchItem, MatchJob, Torrent, TorrentTarget } from '../domain/types';
import { errorMessage, uniqueId } from '../domain/torrents';
export interface MatchAdapter {
  read(target: TorrentTarget): Promise<Torrent>;
  locate(target: TorrentTarget, directory: string): Promise<void>;
  verify(target: TorrentTarget): Promise<void>;
}
export function createMatchJob(
  targets: { target: TorrentTarget; name: string; directory: string }[],
  candidates: string[],
): MatchJob {
  candidates = [...new Set(candidates.map((x) => x.trim()).filter(Boolean))];
  if (!targets.length || !candidates.length)
    throw new Error('Select tasks and candidate directories');
  return {
    id: uniqueId(),
    createdAt: Date.now(),
    candidates,
    running: false,
    cancelled: false,
    items: targets.map((x) => ({
      target: { ...x.target },
      name: x.name,
      originalDir: x.directory,
      currentDir: x.directory,
      candidateIndex: 0,
      phase: 'planned',
      progress: 0,
    })),
  };
}
export class MatchRunner {
  private busy = false;
  constructor(
    private adapter: MatchAdapter,
    private save: (job: MatchJob) => Promise<void>,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private timeoutMs = 30 * 60 * 1000,
  ) {}
  private begin(job: MatchJob) {
    if (this.busy) throw new Error('A match job is already running');
    this.busy = true;
    job.running = true;
    job.cancelled = false;
  }
  private async finish(job: MatchJob) {
    job.running = false;
    this.busy = false;
    if (job.cancelled)
      for (const item of job.items)
        if (
          ['planned', 'locating', 'verifying', 'waiting', 'evaluating', 'restoring'].includes(
            item.phase,
          )
        )
          item.phase = 'cancelled';
    await this.save(job);
  }
  async run(job: MatchJob) {
    this.begin(job);
    try {
      for (const item of job.items) {
        if (job.cancelled) break;
        if (['planned', 'interrupted'].includes(item.phase)) await this.runItem(job, item);
      }
    } finally {
      await this.finish(job);
    }
  }
  cancel(job: MatchJob) {
    job.cancelled = true;
  }
  private async paused(item: MatchItem) {
    const current = await this.adapter.read(item.target);
    if (current.status !== 0 || current.metadataPercentComplete !== 1)
      throw new Error('Task must be paused with complete metadata');
  }
  private async verified(job: MatchJob, item: MatchItem): Promise<Torrent | undefined> {
    if (job.cancelled) {
      item.phase = 'cancelled';
      return;
    }
    item.phase = 'verifying';
    await this.save(job);
    await this.adapter.verify(item.target);
    const start = Date.now();
    let result: Torrent;
    do {
      if (job.cancelled) {
        item.phase = 'cancelled';
        item.error = 'Submitted verification may still be running';
        return;
      }
      item.phase = 'waiting';
      await this.sleep(1000);
      result = await this.adapter.read(item.target);
      item.progress = result.recheckProgress ?? 0;
      await this.save(job);
      if (Date.now() - start >= this.timeoutMs) {
        item.phase = 'interrupted';
        item.error = 'Verification timeout; reconcile before continuing';
        return;
      }
    } while (result.status === 1 || result.status === 2);
    if (
      result.status !== 0 ||
      (result.downloadDir !== undefined && result.downloadDir !== item.currentDir)
    )
      throw new Error(
        'Task state or directory changed during matching; reconcile before continuing',
      );
    return result;
  }
  async restore(job: MatchJob, item: MatchItem) {
    this.begin(job);
    try {
      await this.paused(item);
      item.phase = 'restoring';
      item.error = undefined;
      await this.save(job);
      await this.adapter.locate(item.target, item.originalDir);
      item.currentDir = item.originalDir;
      const result = await this.verified(job, item);
      if (!result) return;
      if (result.error)
        throw new Error(result.errorString || 'Restored directory verification failed');
      const files = result.files ?? [],
        total = files.reduce((sum, file) => sum + file.length, 0);
      if (!files.length) throw new Error('File metadata is unavailable');
      item.progress = total ? files.reduce((sum, file) => sum + file.bytesCompleted, 0) / total : 1;
      item.phase = 'restored';
      await this.save(job);
    } catch (error) {
      item.phase = 'interrupted';
      item.error = errorMessage(error);
    } finally {
      await this.finish(job);
    }
  }
  private async runItem(job: MatchJob, item: MatchItem) {
    try {
      await this.paused(item);
      item.error = undefined;
      for (; item.candidateIndex < job.candidates.length; item.candidateIndex++) {
        if (job.cancelled) {
          item.phase = 'cancelled';
          return;
        }
        item.phase = 'locating';
        await this.save(job);
        const directory = job.candidates[item.candidateIndex];
        await this.adapter.locate(item.target, directory);
        item.currentDir = directory;
        const result = await this.verified(job, item);
        if (!result) return;
        item.phase = 'evaluating';
        if (result.error) throw new Error(result.errorString || 'Verification error');
        const files = result.files ?? [];
        if (!files.length) throw new Error('File metadata is unavailable');
        const total = files.reduce((sum, file) => sum + file.length, 0),
          completed = files.reduce((sum, file) => sum + file.bytesCompleted, 0);
        item.progress = total ? completed / total : 1;
        if (files.every((file) => file.bytesCompleted >= file.length)) {
          item.phase = 'matched';
          await this.save(job);
          return;
        }
        if (completed > 0) {
          item.phase = 'partial';
          await this.save(job);
          return;
        }
      }
      item.phase = 'notMatched';
    } catch (error) {
      item.phase = 'failed';
      item.error = errorMessage(error);
    }
    await this.save(job);
  }
}
