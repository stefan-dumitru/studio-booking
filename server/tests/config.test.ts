import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

/**
 * Boot-time validation exists so the process refuses to start on bad
 * configuration rather than failing on the first request that needs it.
 */

const validEnv = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/studio_booking',
  NODE_ENV: 'test',
  PORT: '3000',
  STUDIO_TIME_ZONE: 'Europe/Bucharest',
  BCRYPT_COST: '12',
  SESSION_SECRET: 'a-test-session-secret',
  APP_BASE_URL: 'http://localhost:5173',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a complete, valid environment', () => {
    const config = loadConfig({ ...validEnv });

    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('test');
    expect(config.bcryptCost).toBe(12);
    expect(config.studioTimeZone).toBe('Europe/Bucharest');
    expect(config.sessionSecret).toBe(validEnv.SESSION_SECRET);
    expect(config.appBaseUrl).toBe(validEnv.APP_BASE_URL);
  });

  it('applies documented defaults for the optional values', () => {
    const config = loadConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      SESSION_SECRET: validEnv.SESSION_SECRET,
      APP_BASE_URL: validEnv.APP_BASE_URL,
    });

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.bcryptCost).toBe(12);
    expect(config.studioTimeZone).toBe('Europe/Bucharest');
    expect(config.smtpUrl).toBe('');
    expect(config.mailFrom).toBe('studio@localhost');
    expect(config.sessionTtlDays).toBe(7);
    expect(config.verifyTokenTtlHours).toBe(24);
    expect(config.resetTokenTtlHours).toBe(1);
  });

  it('rejects a missing SESSION_SECRET', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: validEnv.DATABASE_URL,
        APP_BASE_URL: validEnv.APP_BASE_URL,
      }),
    ).toThrow(/SESSION_SECRET: is required/);
  });

  it('rejects a malformed APP_BASE_URL', () => {
    expect(() => loadConfig({ ...validEnv, APP_BASE_URL: 'not a url' })).toThrow(
      /APP_BASE_URL: is not a valid URL/,
    );
  });

  it('strips a trailing slash from APP_BASE_URL so links never double up', () => {
    const config = loadConfig({
      ...validEnv,
      APP_BASE_URL: 'http://localhost:5173/',
    });
    expect(config.appBaseUrl).toBe('http://localhost:5173');
  });

  it('accepts an empty SMTP_URL as "use the dev mailer"', () => {
    const config = loadConfig({ ...validEnv, SMTP_URL: '' });
    expect(config.smtpUrl).toBe('');
  });

  it('rejects a malformed SMTP_URL', () => {
    expect(() => loadConfig({ ...validEnv, SMTP_URL: 'not a url' })).toThrow(
      /SMTP_URL: is not a valid URL/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL: is required/);
  });

  it('rejects an empty DATABASE_URL, not just an absent one', () => {
    expect(() => loadConfig({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-numeric BCRYPT_COST', () => {
    expect(() => loadConfig({ ...validEnv, BCRYPT_COST: '12abc' })).toThrow(
      /BCRYPT_COST: must be a whole number/,
    );
  });

  it('rejects a BCRYPT_COST outside the safe range', () => {
    expect(() => loadConfig({ ...validEnv, BCRYPT_COST: '2' })).toThrow(
      /BCRYPT_COST: must be between 4 and 15/,
    );
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '70000' })).toThrow(
      /PORT: must be between 1 and 65535/,
    );
  });

  it('rejects an unknown NODE_ENV rather than silently defaulting', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV: must be development, test or production/,
    );
  });

  it('rejects an unrecognised time zone', () => {
    expect(() =>
      loadConfig({ ...validEnv, STUDIO_TIME_ZONE: 'Europe/Nowhere' }),
    ).toThrow(/not a recognised IANA time zone/);
  });

  it('reports every problem at once, so one run fixes them all', () => {
    let message = '';
    try {
      loadConfig({ BCRYPT_COST: 'nope', PORT: '0' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/BCRYPT_COST/);
    expect(message).toMatch(/PORT/);
  });
});
