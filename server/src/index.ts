import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createMailer } from './mail/mailer.js';
import { createApp } from './app.js';

const config = loadConfig();
const pool = createPool({ connectionString: config.databaseUrl });
const mailer = createMailer(config);
const app = createApp({ pool, config, mailer });

if (!config.smtpUrl) {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'SMTP_URL not set -- using the dev console mailer, emails are logged, not sent',
    }),
  );
}

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'server listening',
      port: config.port,
      nodeEnv: config.nodeEnv,
    }),
  );
});

/** Finish in-flight requests and release connections instead of dropping them. */
async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
