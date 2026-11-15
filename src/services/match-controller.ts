import type { MatchJob, MatchItem, TorrentTarget } from '../domain/types';
import { createMatchJob, MatchRunner } from './workflow';
import { useAppStore } from '../stores/app';
let active: MatchJob | undefined;
let runner: MatchRunner | undefined;
function adapter() {
  const app = useAppStore();
  return {
    read: (target: TorrentTarget) =>
      app.readTarget(target, [
        'status',
        'metadataPercentComplete',
        'downloadDir',
        'files',
        'recheckProgress',
        'error',
        'errorString',
      ]),
    locate: (target: TorrentTarget, location: string) =>
      app.command('torrent-set-location', [target], { location, move: false }, true).then(() => {}),
    verify: (target: TorrentTarget) =>
      app.command('torrent-verify', [target], {}, true).then(() => {}),
  };
}
async function run(job: MatchJob) {
  const app = useAppStore();
  if (active?.running) throw new Error('A match job is already running');
  active = job;
  runner = new MatchRunner(adapter(), (value) => app.saveJob(value));
  await runner.run(job);
  await app.refresh(true);
}
export async function startMatch(targets: TorrentTarget[], candidates: string[]) {
  const app = useAppStore();
  await run(
    createMatchJob(
      targets.map((target) => ({
        target,
        name: app.byId.get(target.id)?.name ?? target.hashString,
        directory: app.byId.get(target.id)?.downloadDir ?? '',
      })),
      candidates,
    ),
  );
}
export function cancelMatch() {
  if (active && runner) runner.cancel(active);
}
async function reconcile(job: MatchJob) {
  const app = useAppStore();
  await app.refresh(true);
  for (const item of job.items) {
    if (!['planned', 'interrupted', 'cancelled'].includes(item.phase)) continue;
    const row = app.torrents.find((x) => x.hashString === item.target.hashString);
    if (!row) throw new Error(`Task no longer exists: ${item.name}`);
    item.target = app.targets([row.id])[0];
    const state = await adapter().read(item.target);
    if (state.status !== 0 || state.metadataPercentComplete !== 1)
      throw new Error(`Pause the task and wait for verification/metadata: ${item.name}`);
    item.currentDir = state.downloadDir ?? item.currentDir;
    item.phase = 'planned';
  }
}
export async function resumeMatch() {
  const app = useAppStore();
  const job = structuredClone(app.matchJob!);
  await reconcile(job);
  await run(job);
}
export async function decidePartial(hash: string, accept: boolean) {
  const app = useAppStore();
  if (app.matchJob?.running) throw new Error('Wait for current batch to finish');
  const job = structuredClone(app.matchJob!),
    item = job.items.find((x) => x.target.hashString === hash)!;
  if (item.phase !== 'partial') throw new Error('Partial result changed');
  item.phase = accept ? 'acceptedPartial' : 'planned';
  if (!accept) item.candidateIndex++;
  await app.saveJob(job);
  if (!accept) {
    await reconcile(job);
    await run(job);
  }
}
export async function restoreMatch(item: MatchItem) {
  const app = useAppStore();
  if (app.matchJob?.running) throw new Error('Wait for current batch to finish');
  const job = structuredClone(app.matchJob!),
    entry = job.items.find((x) => x.target.hashString === item.target.hashString)!;
  const row = app.torrents.find((x) => x.hashString === entry.target.hashString);
  if (!row) throw new Error('Task no longer exists');
  entry.target = app.targets([row.id])[0];
  const state = await adapter().read(entry.target);
  if (state.status !== 0)
    throw new Error('Pause the task and wait for verification before restoring');
  active = job;
  runner = new MatchRunner(adapter(), (value) => app.saveJob(value));
  await runner.restore(job, entry);
  await app.refresh(true);
}
