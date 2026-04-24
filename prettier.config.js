/** @type {import("prettier").Config} */
const config = {
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  useTabs: false,
  importOrder: ['<THIRD_PARTY_MODULES>', '', '^[./]'],
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  overrides: [
    {
      files: '*.js',
      options: {
        printWidth: 80,
      },
    },
    {
      files: '*.json',
      options: {
        useTabs: false,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'always',
      },
    },
  ],
}

export default config
