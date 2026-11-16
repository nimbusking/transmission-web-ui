import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/login-entry',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:19101', ...devices['Desktop Chrome'] },
  outputDir: 'artifacts/login-entry-browser',
});
