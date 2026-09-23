import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Tests need DATABASE_URL / TEST_DATABASE_URL the same way the app does. Node's
// built-in loader avoids a dotenv dependency; a missing .env is not fatal here
// because CI would supply real environment variables instead.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env present -- rely on the ambient environment.
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/tests/**/*.test.ts'],
          // Several suites migrate and truncate the one scratch database, so
          // they must not run at the same time as each other.
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['client/src/**/*.test.{ts,tsx}'],
          setupFiles: ['client/src/test-setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
