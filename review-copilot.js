import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const MAX_REVIEW_SIZE = 120_000
const MAX_BUFFER_SIZE = 10_485_760 // 10 MiB
const GIT_PATH = '/usr/bin/git'
const GH_PATH = '/opt/homebrew/bin/gh'
const EXCLUDE = [
  ':!pnpm-lock.yaml',
  ':!package-lock.json',
  ':!yarn.lock',
  ':!node_modules',
  ':!dist',
  ':!.git',
  ':!*.log',
  ':!*.map',
  ':!.DS_Store',
  ':!*.png',
  ':!*.jpg',
  ':!*.jpeg',
  ':!*.gif',
  ':!*.svg',
  ':!*.ico',
  ':!*.heic',
  ':!*.webp',
  ':!*.pdf',
  ':!*.woff',
  ':!*.woff2',
  ':!*.eot',
  ':!*.ttf',
]
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const MODELS = new Set([
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'claude-haiku-4.5',
  'gpt-5',
])

/**
 * Helper to run git commands safely.
 * @param {string[]} arguments_ - Git arguments.
 * @returns {string} Stdout.
 */
function runGit(arguments_) {
  const { stdout, status, error, stderr } = spawnSync(GIT_PATH, arguments_, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER_SIZE,
  })
  if (error) {
    throw new Error(`Git failed: ${error.message}`, { cause: error })
  }
  if (status !== 0) {
    throw new Error(`Git exit ${status}: ${stderr || 'unknown'}`)
  }
  return stdout
}

/**
 * Fetches project metadata from package.json.
 * @returns {Promise<{name: string, description: string}>} Project info.
 */
async function getProject() {
  try {
    const package_ = JSON.parse(await readFile('./package.json', 'utf8'))
    return {
      name: package_.name || 'unnamed',
      description: package_.description || '',
    }
  } catch (error) {
    throw new Error(`Failed to parse package.json: ${error.message}`, {
      cause: error,
    })
  }
}

/**
 * Extracts the model name from CLI arguments.
 * @param {string[]} arguments_ - CLI arguments.
 * @returns {string} Model name.
 */
function getModel(arguments_) {
  return arguments_.find((a) => MODELS.has(a)) || 'claude-sonnet-4.5'
}

/**
 * Gets the total diff for the given scope.
 * @param {boolean} isAll - Full repo or just changes.
 * @returns {string} The filtered and truncated diff.
 */
function getDiff(isAll) {
  const gitArguments = [
    'diff',
    ...(isAll ? [EMPTY_TREE] : []),
    'HEAD',
    '--',
    '.',
    ...EXCLUDE,
  ]
  const stdout = runGit(gitArguments)

  if (stdout.length > MAX_REVIEW_SIZE) {
    process.stderr.write(
      `Warning: Diff size (${stdout.length}b) exceeds limit. Truncating.\n`
    )
    return `${stdout.slice(0, MAX_REVIEW_SIZE)}\n\n[DIFF TRUNCATED]`
  }
  return stdout
}

/**
 * Orchestrates the review.
 * @returns {Promise<void>} Done.
 */
async function main() {
  const project = await getProject()
  const arguments_ = process.argv.slice(2)
  const model = getModel(arguments_)
  process.stderr.write(`Reviewing with ${model}...\n`)

  const diff = getDiff(arguments_.includes('--all'))
  if (!diff.trim()) {
    process.stderr.write('No changes to review.\n')
    return
  }

  const { status } = spawnSync(
    GH_PATH,
    [
      'copilot',
      '--',
      '--model',
      model,
      '--allow-all-tools',
      '-p',
      `Review for ${project.name}:\n\n${diff}`,
    ],
    {
      stdio: 'inherit',
      encoding: 'utf8',
    }
  )

  if (status !== 0) {
    throw new Error(`Copilot exited with code ${status}`)
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`\nError: ${error.message}\n`)
  process.exitCode = 1
}
