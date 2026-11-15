import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.TWUI_PREVIEW_PORT || 4173),
  directory = process.env.TWUI_PREVIEW_DIR || 'dist';
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9_./-]+$/.test(directory))
  throw new Error('Invalid test preview location');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --outDir ${directory}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
});
