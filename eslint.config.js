import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      'coverage/**',
      'server/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Server and shared: Node globals, no DOM.
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Client: browser globals plus the rules of hooks, which catch real bugs
  // rather than style preferences.
  {
    files: ['client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  {
    rules: {
      // Unused variables are a real signal, but an underscore prefix is the
      // conventional way to say "deliberately ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // An empty catch swallows a failure (CLAUDE.md > Code Style). Allowed only
      // where the comment says why.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
);
