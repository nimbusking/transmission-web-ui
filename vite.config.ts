import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { version } from './package.json';
import { resolve } from 'node:path';
function sourceCommit(): string {
  try {
    const gitRoot = statSync('.git').isDirectory()
      ? resolve('.git')
      : resolve(
          readFileSync('.git', 'utf8')
            .trim()
            .replace(/^gitdir: /, ''),
        );
    const head = readFileSync(resolve(gitRoot, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    try {
      return readFileSync(resolve(gitRoot, ref), 'utf8').trim();
    } catch {
      const commonFile = resolve(gitRoot, 'commondir');
      const common = existsSync(commonFile)
        ? resolve(gitRoot, readFileSync(commonFile, 'utf8').trim())
        : gitRoot;
      try {
        return readFileSync(resolve(common, ref), 'utf8').trim();
      } catch {
        return (
          readFileSync(resolve(common, 'packed-refs'), 'utf8')
            .split('\n')
            .find((line) => line.endsWith(` ${ref}`))
            ?.split(' ')[0] ?? 'unknown'
        );
      }
    }
  } catch {
    return process.env.TWUI_SOURCE_COMMIT ?? 'source-archive';
  }
}
const commit = sourceCommit();
function sourceDigest(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      entry.isDirectory()
        ? sourceDigest(`${dir}/${entry.name}`)
        : entry.name + readFileSync(`${dir}/${entry.name}`, 'utf8'),
    )
    .join('');
}
const buildId = `${version}-${commit.slice(0, 12)}-${createHash('sha256')
  .update(
    sourceDigest('src') +
      sourceDigest('public') +
      readFileSync('package-lock.json') +
      readFileSync('index.html') +
      readFileSync('vite.config.ts'),
  )
  .digest('hex')
  .slice(0, 20)}`;

let resolvedBuildId = buildId;
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    vue(),
    {
      name: 'diagnostic-build-manifest',
      configResolved(config) {
        resolvedBuildId = JSON.parse(
          String(config.define?.__BUILD_ID__ ?? JSON.stringify(buildId)),
        );
      },
      generateBundle(_options, bundle) {
        const assets = Object.fromEntries(
          Object.entries(bundle).map(([name, entry]) => [
            name,
            createHash('sha256')
              .update(entry.type === 'chunk' ? entry.code : entry.source)
              .digest('hex'),
          ]),
        );
        assets['diagnostics-bootstrap.js'] = createHash('sha256')
          .update(readFileSync('public/diagnostics-bootstrap.js'))
          .digest('hex');
        this.emitFile({
          type: 'asset',
          fileName: 'diagnostics-manifest.json',
          source: JSON.stringify({ version, buildId: resolvedBuildId, commit, assets }, null, 2),
        });
      },
      transformIndexHtml(html) {
        return html.replace('data-build-id="bootstrap"', `data-build-id="${resolvedBuildId}"`);
      },
    },
  ],
  server: {
    proxy: {
      '/rpc': {
        target: process.env.TR_RPC_TARGET || 'http://127.0.0.1:19091',
        changeOrigin: true,
        rewrite: () => '/transmission/rpc',
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: mode === 'replay' ? { index: 'index.html', replay: 'replay.html' } : 'index.html',
    },
  },
}));
