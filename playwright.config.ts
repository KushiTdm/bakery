// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// En CI (Ubuntu), localhost résout vers ::1 (IPv6) mais Next.js écoute sur 127.0.0.1 (IPv4)
// → forcer 127.0.0.1 en CI pour éviter ECONNREFUSED ::1
const RAW_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:3000';
const BASE_URL = process.env.CI ? RAW_URL.replace('://localhost:', '://127.0.0.1:') : RAW_URL;
const isRemoteTarget = BASE_URL.includes('sauvemie.fr') || BASE_URL.includes('vercel.app');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results.json' }]]
    : [['html']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'auth',
      testDir: './tests/auth',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'ia',
      testDir: './tests/ia',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'journee',
      testDir: './tests/journee',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'stock',
      testDir: './tests/stock',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'security',
      testDir: './tests/security',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'penalites',
      testDir: './tests/penalites',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'conservation',
      testDir: './tests/conservation',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'equipe',
      testDir: './tests/equipe',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      name: 'smoke',
      testDir: './tests/smoke',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
  ],

  // URL distante (sauvemie.fr, vercel.app) → pas de serveur local
  // CI → démarre le build prod avec `npm start`
  // Local → démarre le dev server avec `npm run dev`
  webServer: isRemoteTarget ? undefined : {
    command: process.env.CI ? 'npm start' : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      BYPASS_RATE_LIMIT: 'true',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
});