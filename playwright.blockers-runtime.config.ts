import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/runtime',
  testMatch: 'blockers.spec.ts',
  fullyParallel: true,
  workers: 3,
  timeout: 270000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.lab/blockers-runtime-report' }]],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
