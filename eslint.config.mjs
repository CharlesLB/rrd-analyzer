import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import stylistic from '@stylistic/eslint-plugin';
import { includeIgnoreFile } from 'eslint/config';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

const BLOCK_LIKE_STATEMENTS = ['if', 'for', 'while', 'do', 'switch', 'try'];
const TYPE_DECLARATIONS = ['interface', 'type'];

const stylisticRules = {
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: 'directive', next: '*' },
    { blankLine: 'any', prev: 'directive', next: 'directive' },

    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },

    { blankLine: 'always', prev: '*', next: TYPE_DECLARATIONS },
    { blankLine: 'always', prev: TYPE_DECLARATIONS, next: '*' },

    { blankLine: 'always', prev: '*', next: BLOCK_LIKE_STATEMENTS },
    { blankLine: 'always', prev: BLOCK_LIKE_STATEMENTS, next: '*' },

    { blankLine: 'always', prev: '*', next: ['return', 'throw'] },

    { blankLine: 'always', prev: 'multiline-const', next: '*' },
    { blankLine: 'always', prev: '*', next: 'multiline-const' },
    { blankLine: 'any', prev: 'singleline-const', next: 'singleline-const' },
  ],
};

const securityRules = {
  ...security.configs.recommended.rules,
  'security/detect-eval-with-expression': 'error',
  'security/detect-non-literal-require': 'error',
  'security/detect-child-process': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-bidi-characters': 'error',
  'security/detect-object-injection': 'off',
};

const GIT_IGNORE_FILES = ['.gitignore', '.git/info/exclude'].map((relativePath) => fileURLToPath(new URL(relativePath, import.meta.url)));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- the paths are the two ignore files of this repository, fixed above, never input
const presentGitIgnoreFiles = GIT_IGNORE_FILES.filter((ignoreFile) => existsSync(ignoreFile));

export default [
  ...presentGitIgnoreFiles.map((ignoreFile) => includeIgnoreFile(ignoreFile)),
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      '**/.wrangler/**',
      '**/storybook-static/**',
      '**/wailsjs/**',
      'packages/ui-analyzer/public/**',
      'packages/ui-analyzer/browser-runtime/**',
      'packages/ui-analyzer/e2e/report/**',
      'packages/ui-analyzer/e2e/.artifacts/**',
      'packages/ui-analyzer/tools/design-check/shots/**',
      'packages/ui-landing/e2e/report/**',
      'packages/ui-landing/e2e/.artifacts/**',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { security, '@stylistic': stylistic },
    rules: { ...securityRules, ...stylisticRules },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { security, '@stylistic': stylistic },
    rules: { ...securityRules, ...stylisticRules },
  },
];
