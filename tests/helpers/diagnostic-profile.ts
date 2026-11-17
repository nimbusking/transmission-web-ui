import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
export async function diagnosticCpuSpans(profile: any, buildDirectory: string) {
  const maps = new Map<string, TraceMap | null>();
  const own = new Map<number, boolean>();
  const parents = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  for (const node of profile.nodes) {
    const frame = node.callFrame;
    let hit = false;
    if (
      frame.url.startsWith('http://127.0.0.1:') &&
      new URL(frame.url).pathname.startsWith('/assets/')
    ) {
      if (!maps.has(frame.url)) {
        try {
          maps.set(
            frame.url,
            new TraceMap(
              JSON.parse(
                await readFile(
                  resolve(buildDirectory, `.${new URL(frame.url).pathname}.map`),
                  'utf8',
                ),
              ),
            ),
          );
        } catch {
          maps.set(frame.url, null);
        }
      }
      const map = maps.get(frame.url);
      if (map)
        hit = !!originalPositionFor(map, {
          line: frame.lineNumber + 1,
          column: frame.columnNumber,
        }).source?.includes('/services/diagnostics/');
    }
    own.set(node.id, hit);
  }
  let consecutive = 0,
    maximum = 0,
    samples = 0;
  for (let index = 0; index < profile.samples.length; index++) {
    let node: number | undefined = profile.samples[index];
    let diagnostic = false;
    while (node !== undefined) {
      diagnostic ||= own.get(node) ?? false;
      node = parents.get(node);
    }
    if (diagnostic) {
      consecutive += profile.timeDeltas[index] / 1000;
      samples++;
      maximum = Math.max(maximum, consecutive);
    } else consecutive = 0;
  }
  return {
    diagnosticSamples: samples,
    maxConsecutiveDiagnosticCpuMs: maximum,
    samplingIntervalUs: 1000,
    scope:
      'CPU sample bound with source-map attribution; does not measure OS stalls or prove absence of every possible long task',
  };
}
