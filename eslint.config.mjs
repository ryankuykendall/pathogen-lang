import path from 'node:path';

import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs, plugins, rules } from 'eslint-config-airbnb-extended';
import { rules as prettierConfigRules } from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

const gitignorePath = path.resolve('.', '.gitignore');

const jsConfig = defineConfig([
  // ESLint recommended config
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
  // Stylistic plugin
  plugins.stylistic,
  // Import X plugin
  plugins.importX,
  // Airbnb base recommended config
  ...configs.base.recommended,
  // Strict import rules
  rules.base.importsStrict,
]);

const nodeConfig = defineConfig([
  // Node plugin
  plugins.node,
  // Airbnb Node recommended config
  ...configs.node.recommended,
]);

const typescriptConfig = defineConfig([
  // TypeScript ESLint plugin
  plugins.typescriptEslint,
  // Airbnb base TypeScript config
  ...configs.base.typescript,
  // Strict TypeScript rules
  rules.typescript.typescriptEslintStrict,
]);

const prettierConfig = defineConfig([
  // Prettier plugin
  {
    name: 'prettier/plugin/config',
    plugins: {
      prettier: prettierPlugin,
    },
  },
  // Prettier config
  {
    name: 'prettier/config',
    rules: {
      ...prettierConfigRules,
      'prettier/prettier': 'error',
    },
  },
]);

export default defineConfig([
  // Ignore files and folders listed in .gitignore
  includeIgnoreFile(gitignorePath),

  // Additional ignores beyond .gitignore
  {
    ignores: [
      'website/**',
      'playground/utils/docs-content.js',
      'playground/utils/blog-content.js',
      'playground/types/**',
      'tests/tmp/**',
      'vitest.config.ts',
      'tsup.config.ts',
    ],
  },

  // JavaScript config
  ...jsConfig,
  // Node config
  ...nodeConfig,
  // TypeScript config
  ...typescriptConfig,
  // Prettier config
  ...prettierConfig,

  // ----------------------------------------------------------------
  // TypeScript parser override — use tsconfig.eslint.json for tests & scripts
  // ----------------------------------------------------------------
  {
    name: 'project/typescript-parser-override',
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.eslint.json',
      },
    },
  },

  // ----------------------------------------------------------------
  // Project-specific overrides
  // ----------------------------------------------------------------

  // TypeScript source files
  {
    name: 'project/src-overrides',
    files: ['src/**/*.ts'],
    rules: {
      // Style — codebase uses these patterns extensively
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-labels': 'off',
      'no-param-reassign': 'off',
      'no-nested-ternary': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-void': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'max-classes-per-file': 'off',
      'prefer-destructuring': 'off',
      'default-case': 'off',
      'consistent-return': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      'no-await-in-loop': 'off',
      'no-template-curly-in-string': 'off',
      'no-useless-assignment': 'off',
      'no-promise-executor-return': 'off',
      'import-x/no-extraneous-dependencies': 'off',

      // Use-before-define — parser uses mutual recursion
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, variables: false }],

      // TypeScript strictness tuning
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Imports
      'import-x/prefer-default-export': 'off',
      'import-x/no-cycle': 'off',
      'import-x/no-named-as-default-member': 'off',

      // Node rules not applicable to library code
      'n/no-process-exit': 'off',
      'n/no-sync': 'off',
    },
  },

  // CLI — allow console
  {
    name: 'project/cli-overrides',
    files: ['src/cli.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Worker — allow self
  {
    name: 'project/worker-overrides',
    files: ['src/worker.ts'],
    languageOptions: {
      globals: {
        self: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // Scripts — relaxed
  {
    name: 'project/scripts-overrides',
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-plusplus': 'off',
      'no-await-in-loop': 'off',
      'no-param-reassign': 'off',
      'no-continue': 'off',
      'no-restricted-syntax': 'off',
      'no-underscore-dangle': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-extraneous-dependencies': 'off',
      'import-x/no-namespace': 'off',
      'import-x/order': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      'no-promise-executor-return': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-shadow': 'off',
      'n/no-process-exit': 'off',
      'n/no-sync': 'off',
    },
  },

  // Playground JS — relaxed rules for untyped code
  {
    name: 'project/playground-overrides',
    files: ['playground/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        SVGPathExtended: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-nested-ternary': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-alert': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      'no-await-in-loop': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'no-loop-func': 'off',
      'no-script-url': 'off',
      'no-promise-executor-return': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'no-lonely-if': 'off',
      'no-template-curly-in-string': 'off',
      'prefer-destructuring': 'off',
      'prefer-const': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/no-unresolved': 'off',
      'import-x/extensions': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-namespace': 'off',
      'import-x/order': 'off',
      'class-methods-use-this': 'off',
      'max-classes-per-file': 'off',
      'no-use-before-define': 'off',
      'no-shadow': 'off',
      'default-case': 'off',
      'consistent-return': 'off',
      radix: 'off',
      eqeqeq: ['error', 'smart'],
      // Disable node rules that require TypeScript parser services
      'n/no-sync': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },

  // Playground TS — same relaxed rules as JS, plus TypeScript parser with playground tsconfig
  {
    name: 'project/playground-ts-overrides',
    files: ['playground/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        SVGPathExtended: 'readonly',
      },
      parserOptions: {
        projectService: false,
        project: './playground/tsconfig.json',
      },
    },
    rules: {
      'no-console': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-nested-ternary': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-alert': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      'no-await-in-loop': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'no-loop-func': 'off',
      'no-script-url': 'off',
      'no-promise-executor-return': 'off',
      'no-empty': 'off',
      'no-lonely-if': 'off',
      'no-template-curly-in-string': 'off',
      'prefer-destructuring': 'off',
      'prefer-const': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/no-unresolved': 'off',
      'import-x/extensions': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-namespace': 'off',
      'import-x/order': 'off',
      'class-methods-use-this': 'off',
      'max-classes-per-file': 'off',
      'no-use-before-define': 'off',
      'no-shadow': 'off',
      'default-case': 'off',
      'consistent-return': 'off',
      radix: 'off',
      eqeqeq: ['error', 'smart'],
      'n/no-sync': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      // TypeScript-specific relaxations for playground migration
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // Tests — permissive
  {
    name: 'project/test-overrides',
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-await-in-loop': 'off',
      'no-template-curly-in-string': 'off',
      'no-restricted-syntax': 'off',
      'no-bitwise': 'off',
      'no-useless-escape': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-extraneous-dependencies': 'off',
      'import-x/extensions': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      'n/no-sync': 'off',
      'no-fallthrough': 'off',
    },
  },
]);
