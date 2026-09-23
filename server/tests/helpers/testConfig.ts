import { loadConfig } from '../../src/config.js';
import type { Config } from '../../src/config.js';

/**
 * A valid Config for tests that don't care about its exact values. DATABASE_URL
 * here is never actually connected to -- tests build their own pool via
 * createTestPool() and hand it to createApp separately (see app.ts:
 * AppDependencies takes pool and config independently).
 */
export function createTestConfig(overrides: Partial<Config> = {}): Config {
  const base = loadConfig({
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-not-for-production-use',
    APP_BASE_URL: 'http://localhost:5173',
  });
  return { ...base, ...overrides };
}
