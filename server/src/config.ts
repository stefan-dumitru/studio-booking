/**
 * Environment configuration, validated once at boot.
 *
 * The process refuses to start on a missing or malformed value rather than
 * failing on the first request that happens to need it
 * (specifications/operations.md > Environments & Configuration).
 *
 * Validation is hand-written rather than pulled from a library: it is short
 * enough to read, and the same pattern is reused for the small request bodies
 * in server/src/routes/auth.ts. Admin resource CRUD in Phase 2 has richer
 * bodies -- that is the point to reconsider a schema library like zod, not
 * here.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface Config {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly logLevel: string;
  readonly databaseUrl: string;
  readonly studioTimeZone: string;
  readonly bcryptCost: number;
  readonly sessionSecret: string;
  /** Never derived from the Host header -- see security.md > Environments. */
  readonly appBaseUrl: string;
  /** Empty means "use the dev console mailer" -- see server/src/mail/mailer.ts. */
  readonly smtpUrl: string;
  readonly mailFrom: string;
  readonly sessionTtlDays: number;
  readonly verifyTokenTtlHours: number;
  readonly resetTokenTtlHours: number;
}

/** Collects every problem before throwing, so one run reports all of them. */
class ConfigErrors {
  private readonly problems: string[] = [];

  add(key: string, problem: string): void {
    this.problems.push(`  ${key}: ${problem}`);
  }

  throwIfAny(): void {
    if (this.problems.length === 0) return;
    throw new Error(
      `Invalid environment configuration:\n${this.problems.join('\n')}\n\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
  }
}

function requireString(
  env: NodeJS.ProcessEnv,
  key: string,
  errors: ConfigErrors,
): string {
  const raw = env[key]?.trim();
  if (!raw) {
    errors.add(key, 'is required but missing or empty');
    return '';
  }
  return raw;
}

function optionalString(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string,
): string {
  const raw = env[key]?.trim();
  return raw ? raw : fallback;
}

function requireInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  range: { min: number; max: number },
  errors: ConfigErrors,
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;

  // Number() accepts '12abc' as NaN but also accepts '' as 0 and '0x10' as 16,
  // so test the shape before converting.
  if (!/^-?\d+$/.test(raw)) {
    errors.add(key, `must be a whole number, got ${JSON.stringify(raw)}`);
    return fallback;
  }

  const value = Number(raw);
  if (value < range.min || value > range.max) {
    errors.add(key, `must be between ${range.min} and ${range.max}, got ${value}`);
    return fallback;
  }
  return value;
}

function parseNodeEnv(env: NodeJS.ProcessEnv, errors: ConfigErrors): NodeEnv {
  const raw = optionalString(env, 'NODE_ENV', 'development');
  if (raw === 'development' || raw === 'test' || raw === 'production') {
    return raw;
  }
  errors.add(
    'NODE_ENV',
    `must be development, test or production, got ${JSON.stringify(raw)}`,
  );
  return 'development';
}

function parseTimeZone(env: NodeJS.ProcessEnv, errors: ConfigErrors): string {
  const raw = optionalString(env, 'STUDIO_TIME_ZONE', 'Europe/Bucharest');
  try {
    // Throws RangeError on an unknown zone, which is exactly the failure we
    // want at boot rather than at the first time a slot gets rendered.
    new Intl.DateTimeFormat('en-GB', { timeZone: raw });
  } catch {
    errors.add(
      'STUDIO_TIME_ZONE',
      `is not a recognised IANA time zone: ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

function parseAppBaseUrl(env: NodeJS.ProcessEnv, errors: ConfigErrors): string {
  const raw = requireString(env, 'APP_BASE_URL', errors);
  if (!raw) return raw;

  try {
    new URL(raw);
  } catch {
    errors.add('APP_BASE_URL', `is not a valid URL: ${JSON.stringify(raw)}`);
  }
  // A trailing slash would double up when a path is appended (".../verify-email").
  return raw.replace(/\/+$/, '');
}

function parseSmtpUrl(env: NodeJS.ProcessEnv, errors: ConfigErrors): string {
  const raw = env['SMTP_URL']?.trim() ?? '';
  if (!raw) return raw;

  try {
    new URL(raw);
  } catch {
    errors.add('SMTP_URL', `is not a valid URL: ${JSON.stringify(raw)}`);
  }
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors = new ConfigErrors();

  const config: Config = {
    nodeEnv: parseNodeEnv(env, errors),
    port: requireInteger(env, 'PORT', 3000, { min: 1, max: 65535 }, errors),
    logLevel: optionalString(env, 'LOG_LEVEL', 'info'),
    databaseUrl: requireString(env, 'DATABASE_URL', errors),
    studioTimeZone: parseTimeZone(env, errors),
    bcryptCost: requireInteger(env, 'BCRYPT_COST', 12, { min: 4, max: 15 }, errors),
    sessionSecret: requireString(env, 'SESSION_SECRET', errors),
    appBaseUrl: parseAppBaseUrl(env, errors),
    smtpUrl: parseSmtpUrl(env, errors),
    mailFrom: optionalString(env, 'MAIL_FROM', 'studio@localhost'),
    sessionTtlDays: requireInteger(
      env,
      'SESSION_TTL_DAYS',
      7,
      { min: 1, max: 90 },
      errors,
    ),
    verifyTokenTtlHours: requireInteger(
      env,
      'VERIFY_TOKEN_TTL_HOURS',
      24,
      { min: 1, max: 24 * 14 },
      errors,
    ),
    resetTokenTtlHours: requireInteger(
      env,
      'RESET_TOKEN_TTL_HOURS',
      1,
      { min: 1, max: 24 },
      errors,
    ),
  };

  errors.throwIfAny();
  return config;
}
