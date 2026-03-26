// playwright.config.ts
// Configuration Playwright pour BakeryOS
// ─────────────────────────────────────────────────────────────

import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';


export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Tests unitaires (pas besoin de browser)
    {
      name: 'unit',
      testDir: './tests/unit',
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests d'authentification et permissions
    {
      name: 'auth',
      testDir: './tests/auth',
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests IA
    {
      name: 'ia',
      testDir: './tests/ia',
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests journée
    {
      name: 'journee',
      testDir: './tests/journee',
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests E2E complets
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    // Projet par défaut (tous les tests)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Serveur de dev pour les tests locaux
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      BYPASS_RATE_LIMIT: 'true', // Désactive le rate limiting pour les tests
    },
  },
});