/**
 * @file UI tools for macOS.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { logger } from './logger.js'

/**
 * Escapes text for safe use in AppleScript strings.
 * @param {string} value - Input text.
 * @returns {string} Escaped text safe for AppleScript.
 */
function escapeAppleScriptString(value) {
  return value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\t', String.raw`\t`)
}

const DIALOG_LABELS_BY_LOCALE = {
  cs: { cancel: 'Zrušit', skip: 'Přeskočit', ok: 'OK' },
  en: { cancel: 'Cancel', skip: 'Skip', ok: 'OK' },
}

const DIALOG_BUTTONS = {
  CANCEL: 'CANCEL',
  OK: 'OK',
  SKIP: 'SKIP',
}

function getDialogLabels() {
  const locale = (process.env.SMART_RENAMER_LOCALE || 'cs').toLowerCase()
  const shortLocale = locale.split('-')[0]
  return DIALOG_LABELS_BY_LOCALE[shortLocale] || DIALOG_LABELS_BY_LOCALE.cs
}

function mapButtonToCanonical(button, labels) {
  if (button === labels.ok) return DIALOG_BUTTONS.OK
  if (button === labels.skip) return DIALOG_BUTTONS.SKIP
  if (button === labels.cancel) return DIALOG_BUTTONS.CANCEL
  return undefined
}

function parseDialogOutput(processResult, labels) {
  const buttonMatch = processResult.stdout.match(/button returned:(.*?),/)
  const txtMatch = processResult.stdout.match(/text returned:(.*)$/s)

  if (!buttonMatch || !txtMatch) {
    logger.error(
      `Nečekaný výstup AppleScriptu při zpracování výsledku (stav: ${processResult.status})`
    )
    throw new Error('Invalid response from dialog')
  }

  const button = mapButtonToCanonical(buttonMatch[1].trim(), labels)
  if (!button) {
    logger.error(`Neznámé tlačítko z AppleScriptu: ${buttonMatch[1].trim()}`)
    throw new Error('Unknown dialog button')
  }

  return { button, text: txtMatch[1].trim() }
}

/**
 * Opens file preview in macOS Preview.
 * @param {string} filePath - File path.
 * @returns {void}
 */
export function openPreview(filePath) {
  if (existsSync(filePath)) {
    const processResult = spawnSync('/usr/bin/open', [filePath])
    if (processResult.error) {
      /* Ignore error */
    }
  }
}

/**
 * Closes file preview in macOS Preview.
 * @param {string} fileName - File name.
 * @returns {void}
 */
export function closePreview(fileName) {
  const escapedName = escapeAppleScriptString(fileName)
  const script = `tell application "Preview" to close (every window whose name contains "${escapedName}")`
  const osascriptPath = '/usr/bin/osascript'
  const actualPath = existsSync(osascriptPath) ? osascriptPath : 'osascript'
  const processResult = spawnSync(actualPath, ['-e', script], {
    encoding: 'utf8',
  })
  if (processResult.error) {
    /* Silent skip */
  }
}

/**
 * Shows native input dialog with 3 buttons.
 * @param {string} promptText - Prompt text.
 * @param {string} [defaultValue] - Default value.
 * @returns {object|undefined} { text: string, button: string } or undefined.
 */
export function showInputDialog(promptText, defaultValue = '') {
  const escapedPrompt = escapeAppleScriptString(promptText)
  const escapedDefault = escapeAppleScriptString(defaultValue)
  const labels = getDialogLabels()
  const localizedCancel = escapeAppleScriptString(labels.cancel)
  const localizedSkip = escapeAppleScriptString(labels.skip)
  const localizedOk = escapeAppleScriptString(labels.ok)

  const script = String.raw`display dialog "${escapedPrompt}" default answer "${escapedDefault}" with icon note buttons {"${localizedCancel}", "${localizedSkip}", "${localizedOk}"} default button "${localizedOk}" cancel button "${localizedCancel}"`

  const osascriptPath = '/usr/bin/osascript'
  const actualPath = existsSync(osascriptPath) ? osascriptPath : 'osascript'
  const processResult = spawnSync(actualPath, ['-e', script], {
    encoding: 'utf8',
  })

  if (processResult.status === 0) {
    return parseDialogOutput(processResult, labels)
  }
  return undefined // Cancelled
}

/**
 * Sanitises user input for safe name.
 * @param {string} input - User input.
 * @returns {string} Sanitised string.
 */
export function sanitizeUserInput(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string')
  }
  if (input.trim() === '') return ''

  return input
    .trim()
    .slice(0, 200)
    .replaceAll(/[:/\\|"*?<>]/g, '')
    .replaceAll(/\s+/g, ' ')
}
