import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/login-entry',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:19101' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  outputDir: 'artifacts/login-entry-browser',
});
