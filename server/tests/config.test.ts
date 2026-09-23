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
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a complete, valid environment', () => {
    const config = loadConfig({ ...validEnv });

    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('test');
    expect(config.bcryptCost).toBe(12);
    expect(config.studioTimeZone).toBe('Europe/Bucharest');
  });

  it('applies documented defaults for the optional values', () => {
    const config = loadConfig({ DATABASE_URL: validEnv.DATABASE_URL });

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.bcryptCost).toBe(12);
    expect(config.studioTimeZone).toBe('Europe/Bucharest');
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
