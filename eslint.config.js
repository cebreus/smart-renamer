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
 * These rules are the main part of the project.
 */
const ENGINEERING_STANDARDS = {
  name: 'smart-renamer/engineering-standards',
  files: ['**/*.js'],
  rules: {
    // Paradigm: Functional/procedural, no classes
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

    // Top-level declarations: Named function only
    'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
    'func-names': ['error', 'always'],

    // Runtime: Node.js 22+, ESM only, stdlib imports with node:
    'n/prefer-node-protocol': 'error',

    // Syntax: No ++/--; use explicit increments.
    'no-plusplus': 'error',

    // Errors: Preserve chains with Error.cause
    'unicorn/error-message': 'error',

    // Files: kebab-case.js
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
  },
}

/**
 * AI_GUARDRAILS
 * Strict rules for AI code.
 */
const AI_GUARDRAILS = {
  name: 'smart-renamer/ai-guardrails',
  files: ['**/*.js'],
  rules: {
    complexity: ['error', { max: 6 }],
    'max-depth': ['error', { max: 3 }],
    'max-lines': [
      'error',
      { max: 250, skipBlankLines: true, skipComments: true },
    ],
    'max-lines-per-function': [
      'error',
      { max: 40, skipBlankLines: true, skipComments: true },
    ],
    'max-nested-callbacks': ['error', { max: 2 }],
    'max-params': ['error', { max: 3 }],
    'max-statements': ['error', { max: 12 }],
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

  // Base configurations
  js.configs.recommended,
  regexp.configs['flat/recommended'],
  promise.configs['flat/recommended'],
  n.configs['flat/recommended-module'],
  security.configs.recommended,
  sonarjs.configs.recommended,
  unicorn.configs.recommended,

  // JSDoc
  {
    name: 'smart-renamer/jsdoc',
    plugins: { jsdoc },
    rules: {
      ...jsdoc.configs['flat/recommended'].rules,
      'jsdoc/require-jsdoc': ['error', { enableFixer: false }],
      'jsdoc/check-param-names': 'error',
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-type': 'error',
    },
  },

  // Core Quality & Logic
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

      // Security & Robustness Tightening
      'security/detect-object-injection': 'off', // Keep off for mapping
      'security/detect-child-process': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'sonarjs/no-duplicate-string': 'off', // Often nits in scripts
      'sonarjs/cognitive-complexity': ['error', 10],
      'sonarjs/no-redundant-jump': 'error',
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
