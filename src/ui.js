/**
 * @file UI tools for macOS.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Opens file preview in macOS Preview.
 * @param {string} filePath - File path.
 * @returns {void}
 */
export function openPreview(filePath) {
  if (existsSync(filePath)) {
    const process = spawnSync('/usr/bin/open', [filePath])
    if (process.error) {
      void 0
    }
  }
}

/**
 * Closes file preview in macOS Preview.
 * @param {string} fileName - File name.
 * @returns {void}
 */
export function closePreview(fileName) {
  const script = `tell application "Preview" to close (every window whose name contains "${fileName}")`
  const osascriptPath = '/usr/bin/osascript'
  const actualPath = existsSync(osascriptPath) ? osascriptPath : 'osascript'
  const process = spawnSync(actualPath, ['-e', script], { encoding: 'utf8' })
  if (process.error) {
    void 0
  }
}

/**
 * Shows native input dialog.
 * @param {string} promptText - Prompt text.
 * @param {string} [defaultValue] - Default value.
 * @returns {string|undefined} Answer or undefined.
 */
export function showInputDialog(promptText, defaultValue = '') {
  const escapedPrompt = promptText.replaceAll('"', String.raw`\"`)
  const escapedDefault = defaultValue.replaceAll('"', String.raw`\"`)

  const script = String.raw`display dialog "${escapedPrompt}" default answer "${escapedDefault}" with icon note buttons {"Zrušit", "OK"} default button "OK"`

  const osascriptPath = '/usr/bin/osascript'
  const actualPath = existsSync(osascriptPath) ? osascriptPath : 'osascript'
  const process = spawnSync(actualPath, ['-e', script], { encoding: 'utf8' })

  if (process.status === 0) {
    const match = process.stdout.match(/text returned:(.*)$/s)
    if (match) {
      return match[1].trim()
    }
  }
  return undefined
}

/**
 * Shows native confirm dialog.
 * @param {string} promptText - Prompt text.
 * @returns {boolean} Confirm result.
 */
export function showConfirmDialog(promptText) {
  const escapedPrompt = promptText.replaceAll('"', String.raw`\"`)
  const script = String.raw`display dialog "${escapedPrompt}" with icon caution buttons {"Ne", "Ano"} default button "Ano"`

  const osascriptPath = '/usr/bin/osascript'
  const actualPath = existsSync(osascriptPath) ? osascriptPath : 'osascript'
  const process = spawnSync(actualPath, ['-e', script], { encoding: 'utf8' })

  if (process.status !== 0) {
    return false
  }

  return process.stdout.includes('button returned:Ano')
}

/**
 * Sanitises user input for safe name.
 * @param {string} input - User input.
 * @returns {string} Sanitised string.
 */
export function sanitizeUserInput(input) {
  if (!input) return ''

  return input
    .trim()
    .slice(0, 50)
    .replaceAll(/[:/\\|"*?<>]/g, '')
    .replaceAll(/\s+/g, ' ')
}
