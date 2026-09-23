import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { createTestConfig } from './testConfig.js';
import { createFakeMailer } from './fakeMailer.js';
import type { FakeMailer } from './fakeMailer.js';
import type { Config } from '../../src/config.js';
import type { Express } from 'express';

export interface TestApp {
  readonly app: Express;
  readonly mailer: FakeMailer;
  readonly config: Config;
}

/** One fresh app (and fresh rate-limit counters) per call -- see rateLimit.ts. */
export function buildTestApp(pool: Pool, overrides: Partial<Config> = {}): TestApp {
  const config = createTestConfig(overrides);
  const mailer = createFakeMailer();
  const app = createApp({ pool, config, mailer });
  return { app, mailer, config };
}
