import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Import paths that climb into another top-level layer of src/ (e.g. `../../state/x`).
 * Layer folders must not reuse these names for their own subfolders.
 */
const layer = (name) => ({
  regex: `^(?:(?:\\.\\./)+|@/)${name}(/|$)`,
  message: `This layer must not import from ${name}/ (see spec.md §3.1).`,
});

const frameworkImports = [
  { regex: '^react(-dom)?(/|$)', message: 'core/ must not depend on React.' },
  { regex: '^phaser(/|$)', message: 'core/ must not depend on Phaser.' },
  { regex: '^zustand(/|$)', message: 'core/ must not depend on Zustand.' },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{tsx,ts}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.ts', 'src/art/png.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    ...tseslint.configs.disableTypeChecked,
  },

  // ---- Architecture guardrails (spec.md §3.1, §12.1) ----
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...frameworkImports,
            layer('render'),
            layer('ui'),
            layer('state'),
            layer('persistence'),
            layer('app'),
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must not use the DOM.' },
        { name: 'document', message: 'core/ must not use the DOM.' },
        { name: 'localStorage', message: 'core/ must not touch storage.' },
        { name: 'sessionStorage', message: 'core/ must not touch storage.' },
        { name: 'performance', message: 'core/ must be deterministic.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use core/rng.ts (seeded).' },
        { object: 'Date', property: 'now', message: 'core/ must be deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'core/ must be deterministic.' },
      ],
    },
  },
  {
    files: ['src/art/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...frameworkImports.map((p) => ({ ...p, message: p.message.replace('core/', 'art/') })),
            layer('render'),
            layer('ui'),
            layer('state'),
            layer('persistence'),
            layer('app'),
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            layer('render'),
            { regex: '^phaser(/|$)', message: 'ui/ must not use Phaser.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/render/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [layer('ui'), layer('persistence')] }],
    },
  },
  {
    files: ['src/persistence/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('render'), layer('ui'), layer('app')] },
      ],
    },
  },

  prettier,
);
