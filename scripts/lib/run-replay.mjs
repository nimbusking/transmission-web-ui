/* global window */
// Native Response.json() uses browser tasks outside the fake timer queue. Drain each
// recorded causal boundary before advancing logical time to the next input.
export async function runReplay(page, timing) {
  await page.clock.install({ time: timing.wallTime });
  await page.clock.pauseAt(timing.wallTime);
  await page.evaluate(() => window.__replay.arm());
  let elapsed = 0;
  for (const barrier of timing.barriers) {
    const target = Math.ceil(barrier.at) + 1;
    if (target > elapsed) {
      await page.clock.runFor(target - elapsed);
      elapsed = target;
    }
    await page.waitForFunction((barrier) => window.__replay.settledAt(barrier), barrier, {
      timeout: 3000,
    });
  }
  const target = Math.ceil(timing.duration) + 1;
  if (target > elapsed) await page.clock.runFor(target - elapsed);
  await page.waitForFunction(() => window.__replay.report().pending === 0, undefined, {
    timeout: 3000,
  });
  return page.evaluate(() => window.__replay.report());
}
