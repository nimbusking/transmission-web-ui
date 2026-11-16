import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/runtime',
  testMatch: 'settings.spec.ts',
  fullyParallel: true,
  workers: 4,
  timeout: 270000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '.lab/settings-state-runtime-report' }],
  ],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
