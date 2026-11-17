// Test-only defect injection. Never used by release or normal builds.
import { build } from 'vite';
await build({
  mode: 'replay',
  define: { __BUILD_ID__: JSON.stringify('diagnostics-controlled-fault-v1') },
  build: { outDir: 'artifacts/replay-fault-build' },
  plugins: [
    {
      name: 'diagnostics-test-defect',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/stores/app.ts')) return;
        const marker =
          "        if (selectedId.value !== null && !byId.has(selectedId.value)) select(null, 'internal');";
        if (!code.includes(marker)) throw new Error('Fault fixture anchor changed');
        return code.replace(
          marker,
          `        for (const item of byId.values()) item.status = 4;\n${marker}`,
        );
      },
    },
  ],
});
