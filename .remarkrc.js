import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkLintHeadingWhitespace from 'remark-lint-heading-whitespace'
import remarkLintNoDuplicateHeadings from 'remark-lint-no-duplicate-headings'
import remarkPresetLintConsistent from 'remark-preset-lint-consistent'
import remarkPresetLintRecommended from 'remark-preset-lint-recommended'
import remarkPresetPrettier from 'remark-preset-prettier'

/** @type {import('unified').Preset} */
const config = {
  settings: {
    bullet: '-',
    fences: true,
    incrementListMarker: true,
    tightDefinitions: true,
    commonmark: true,
    rule: '-',
    ruleSpaces: false,
    ruleRepetition: 3,
    tablePipeAlign: true,
    tableCellPadding: true,
  },
  plugins: [
    remarkFrontmatter,
    remarkGfm,
    remarkPresetLintRecommended,
    remarkPresetLintConsistent,
    remarkLintHeadingWhitespace,
    remarkLintNoDuplicateHeadings,
    ['remark-lint-thematic-break-marker', false],
    remarkPresetPrettier,
  ],
}

export default config
