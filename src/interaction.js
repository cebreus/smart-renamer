/**
 * @file Interactive user input handling for name refinement.
 */

import path from 'node:path'

import { CONFIG } from './config.js'
import { logger } from './logger.js'
import { assembleFilename, getMtimeDate, parseProposedName } from './rename.js'
import {
  closePreview,
  openPreview,
  sanitizeUserInput,
  showInputDialog,
} from './ui.js'
import { ensureObject } from './utilities.js'

/**
 * Builds proposed filename for the dialog.
 * @param {object} current - Current discovery state.
 * @param {string} current.date - Current date.
 * @param {string} current.company - Current company.
 * @param {string} current.title - Current title.
 * @param {string} absPath - Absolute file path.
 * @returns {string} Proposed filename.
 */
export function buildProposedName(current, absPath) {
  let isMtime = false
  let currentDate = current.date
  if (!currentDate) {
    currentDate = getMtimeDate(absPath)
    isMtime = true
  }

  return assembleFilename({
    date: currentDate,
    company: current.company,
    title: current.title,
    extension: '',
    isMtime,
  }).trim()
}

function filterCurrent(list, current) {
  const normalizedCurrent = (current || '').toLowerCase().trim()
  return (list || []).filter(
    (item) => item.toLowerCase().trim() !== normalizedCurrent
  )
}

function getCategorizedSuggestions(current) {
  return {
    dates: filterCurrent(current.date_suggestions, current.date).slice(0, 3),
    companies: filterCurrent(
      current.company_suggestions,
      current.company
    ).slice(0, 3),
    titles: filterCurrent(current.title_suggestions, current.title).slice(0, 3),
  }
}

function formatRow(emoji, items, startNumber) {
  if (items.length === 0) return ''
  const formatted = items
    .map((item, index) => `(${startNumber + index}) ${item}`)
    .join('  |  ')
  return `\n${emoji}  ${formatted}`
}

function buildDashboard(suggestions) {
  const dates = formatRow('📅', suggestions.dates, 1)
  const companies = formatRow('🏢', suggestions.companies, 4)
  const titles = formatRow('📝', suggestions.titles, 7)
  return `${dates}${companies}${titles}`
}

function applyCategorizedSelection(userInput, suggestions, current) {
  const digits = [...userInput.trim()]
  if (digits.length === 0 || !digits.every((d) => /^[1-9]$/.test(d))) {
    return false
  }

  const ranges = [
    { start: 1, end: 3, key: 'date', values: suggestions.dates },
    { start: 4, end: 6, key: 'company', values: suggestions.companies },
    { start: 7, end: 9, key: 'title', values: suggestions.titles },
  ]

  for (const digit of digits) {
    const index = Number.parseInt(digit, 10)
    const selected = ranges.find(
      (range) => index >= range.start && index <= range.end
    )
    if (selected) {
      const offset = index - selected.start
      const value = selected.values[offset]
      if (value) {
        current[selected.key] = value
      }
    }
  }
  return true
}

async function handleAiPrompt(userInput, context) {
  const nextResult = await context.runDiscovery({
    aiSession: context.aiSession,
    pages: context.pages,
    originalName: context.originalNameOnly,
    userPrompt: userInput.slice(4).trim(),
  })
  if (nextResult && nextResult.method !== 'fallback') {
    return nextResult
  }
  return context.current
}

function processAction(result, context) {
  if (result === undefined) throw new Error('Operace zrušena (Zrušit/Escape)')
  if (result.button === 'SKIP' || result.button === 'CANCEL') {
    return { type: 'skip' }
  }

  const input = result.text.trim()
  const lowerInput = input.toLowerCase()

  if (result.button === 'OK' && (lowerInput === '/ok' || lowerInput === '')) {
    return { type: 'done' }
  }
  if (lowerInput === '/skip') return { type: 'skip' }
  if (lowerInput.startsWith('/ai ')) return { type: 'ai_prompt' }

  if (applyCategorizedSelection(input, context.suggestions, context.current)) {
    return { type: 'shortcut' }
  }
  return { type: 'manual' }
}

function formatAiFeedback(visionCheck) {
  if (!visionCheck) return ''
  const lower = visionCheck.toLowerCase()
  const isWarning =
    lower.includes('nečitelný') ||
    lower.includes('garbled') ||
    lower.includes('čitelnost: [0-5]') // This literal marks an unfilled template value.
  const icon = isWarning ? '⚠️ VAROVÁNÍ AI' : '🤖 AI'
  return `${icon}: ${visionCheck}\n\n`
}

function formatMethod(method) {
  const map = {
    ai: '🤖 Metoda: ai',
    registry: '📜 Metoda: registr',
    cache: '💾 Metoda: paměť',
    manual: '⌨️ Metoda: manuálně',
  }
  return map[method] || `Metoda: ${method}`
}

function formatPrompt(state, fileName, dashboard, pageStats) {
  const header = formatAiFeedback(state.current.vision_check)
  const method = formatMethod(state.current.method)
  return `${header}📄 ${pageStats}  |  Soubor: ${fileName}\n${method}${dashboard}\n\nUpravte název (Enter pro OK, tlačítko pro přeskočení):`
}

function getDialogAction(current, fileName, pageStats, absPath) {
  const suggestions = getCategorizedSuggestions(current)
  const dialogResult = showInputDialog(
    formatPrompt({ current }, fileName, buildDashboard(suggestions), pageStats),
    buildProposedName(current, absPath)
  )
  const action = processAction(dialogResult, { suggestions, current })
  return { action, dialogResult }
}

let warnedInvalidInteractionMaxSteps = false

function assertWithinInteractionLimit(iterations) {
  const configuredLimit = CONFIG.INTERACTION_MAX_STEPS
  const limit =
    Number.isFinite(configuredLimit) &&
    Number.isInteger(configuredLimit) &&
    configuredLimit > 0
      ? configuredLimit
      : 100

  if (limit !== configuredLimit && !warnedInvalidInteractionMaxSteps) {
    warnedInvalidInteractionMaxSteps = true
    logger.warn(
      `Invalid INTERACTION_MAX_STEPS config; using fallback limit=${limit}, current=${iterations}`
    )
  }

  if (iterations > limit * 0.8) {
    logger.warn(
      `Interaction limit warning: limit=${limit}, current=${iterations}`
    )
  }
  if (iterations > limit) {
    throw new Error(
      `Interaction limit exceeded: limit=${limit}, current=${iterations}`
    )
  }
}

function buildFinalResult(action, dialogResult, current) {
  const final =
    action.type === 'done'
      ? current
      : {
          ...current,
          ...parseProposedName(sanitizeUserInput(dialogResult.text)),
        }
  return {
    company:
      final.company || current.company || sanitizeUserInput(dialogResult.text),
    discovery: { ...current, ...final },
  }
}

async function handleIterativeLoop(parameters, state) {
  const { absPath, discovery, pages } = parameters
  const fileName = path.basename(absPath)
  const safePagesLength = pages?.length ?? 0
  const pageStats = `${discovery.pagesAnalyzed ?? Math.min(safePagesLength, 3)}/${safePagesLength}`
  let iterations = 0
  while (true) {
    iterations += 1
    assertWithinInteractionLimit(iterations)
    const { action, dialogResult } = getDialogAction(
      state.current,
      fileName,
      pageStats,
      absPath
    )
    if (action.type === 'ai_prompt') {
      state.current = await handleAiPrompt(dialogResult.text, {
        ...parameters,
        current: state.current,
      })
      continue
    }
    if (action.type === 'shortcut') continue
    if (action.type === 'skip') throw new Error('Soubor přeskočen uživatelem')
    return buildFinalResult(action, dialogResult, state.current)
  }
}

/**
 * Runs iterative manual refinement for discovered file metadata.
 * @param {object} parameters - Input parameters.
 * @param {string} parameters.absPath - Absolute file path.
 * @param {import('./discovery.js').DiscoveryResult} parameters.discovery - Initial discovery payload.
 * @param {Array<import('./ocr.js').OCRPage>} parameters.pages - OCR page data.
 * @param {string} parameters.originalNameOnly - Original filename without extension.
 * @param {function(object): Promise<import('./discovery.js').DiscoveryResult>} parameters.runDiscovery - Discovery function for /ai prompts.
 * @param {object} [parameters.aiSession] - Per-file AI session state.
 * @returns {Promise<{company: string, discovery: import('./discovery.js').DiscoveryResult}>} Final company and merged discovery object.
 */
export async function handleIterativeInput(parameters) {
  ensureObject(parameters, 'parameters')
  const state = { current: parameters.discovery }
  openPreview(parameters.absPath)
  try {
    return await handleIterativeLoop(parameters, state)
  } finally {
    closePreview(parameters.absPath)
  }
}
