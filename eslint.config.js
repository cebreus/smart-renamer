import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import jsdoc from 'eslint-plugin-jsdoc'
import n from 'eslint-plugin-n'
import promise from 'eslint-plugin-promise'
import * as regexp from 'eslint-plugin-regexp'
import security from 'eslint-plugin-security'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'

/**
 * ENGINEERING_STANDARDS (from GEMINI.md)
 */
const ENGINEERING_STANDARDS = {
  name: 'smart-renamer/engineering-standards',
  files: ['**/*.js'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ClassDeclaration',
        message:
          'Classes are forbidden. Use named functions and plain objects.',
      },
      {
        selector: 'ClassExpression',
        message:
          'Classes are forbidden. Use named functions and plain objects.',
      },
      {
        selector: 'ExportDefaultDeclaration',
        message: 'Default exports are forbidden. Use named exports only.',
      },
      {
        selector:
          'Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
        message:
          'Top-level arrow functions are forbidden. Use named function declarations.',
      },
      {
        selector:
          "CallExpression[callee.name='spawnSync'][arguments.length>0]:not([parent.type='VariableDeclarator'])",
        message:
          'spawnSync() results must be assigned to a variable for error and status checking.',
      },
    ],
    'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
    'func-names': ['error', 'always'],
    'n/prefer-node-protocol': 'error',
    'no-plusplus': 'error',
    'unicorn/error-message': 'error',
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
  },
}

/**
 * AI_GUARDRAILS
 */
const AI_GUARDRAILS = {
  name: 'smart-renamer/ai-guardrails',
  files: ['**/*.js'],
  rules: {
    complexity: ['error', { max: 10 }],
    'max-depth': ['error', { max: 3 }],
    'max-lines': [
      'error',
      { max: 250, skipBlankLines: true, skipComments: true },
    ],
    'max-lines-per-function': [
      'error',
      { max: 50, skipBlankLines: true, skipComments: true },
    ],
    'max-nested-callbacks': ['error', { max: 2 }],
    'max-params': ['error', { max: 4 }],
    'max-statements': ['error', { max: 18 }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-warning-comments': [
      'error',
      { terms: ['todo', 'fixme', 'xxx'], location: 'start' },
    ],
  },
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['node_modules/', '.temp/', 'dist/', 'build*/', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  regexp.configs['flat/recommended'],
  promise.configs['flat/recommended'],
  n.configs['flat/recommended-module'],
  security.configs.recommended,
  sonarjs.configs.recommended,
  unicorn.configs.recommended,

  {
    name: 'smart-renamer/jsdoc',
    plugins: { jsdoc },
    rules: {
      ...jsdoc.configs['flat/recommended'].rules,
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-type': 'warn',
    },
  },

  {
    name: 'smart-renamer/core-quality',
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'consistent-return': 'error',
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow': 'error',
      'no-use-before-define': 'error',
      'no-self-compare': 'error',
      'no-nested-ternary': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-template-curly-in-string': 'error',
      'no-implicit-coercion': [
        'error',
        {
          boolean: true,
          number: true,
          string: true,
          disallowTemplateShorthand: true,
        },
      ],
      'promise/prefer-await-to-then': 'error',
      'promise/prefer-await-to-callbacks': 'error',
      'security/detect-object-injection': 'off',
      'security/detect-child-process': 'error',
      // CLI tool: all fs calls use runtime paths by design — false positive for this project
      'security/detect-non-literal-fs-filename': 'off',
      // Registry patterns are pre-validated by safe-regex before use
      'security/detect-non-literal-regexp': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': ['error', 10],
      'sonarjs/no-redundant-jump': 'off',
      // Conflicts with consistent-return: one cannot satisfy both simultaneously
      'unicorn/no-useless-undefined': 'off',
    },
  },

  ENGINEERING_STANDARDS,
  AI_GUARDRAILS,

  // Relaxation for configs
  {
    name: 'smart-renamer/config-relaxation',
    files: [
      '**/eslint.config.js',
      '**/prettier.config.js',
      '**/.remarkrc.js',
      '**/.dependency-cruiser.js',
      '**/tests/**/*.js',
      '**/test/**/*.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'max-lines': 'off',
      'jsdoc/require-jsdoc': 'off',
      'n/no-unpublished-import': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'promise/prefer-await-to-then': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },

  prettierConfig,
]
