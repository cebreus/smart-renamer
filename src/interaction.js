/**
 * @file Interactive user input handling for name refinement.
 */

import path from 'node:path'

import { CONFIG } from './config.js'
import {
  applyCategorizedSelection,
  buildDashboard,
  buildProposedName,
  getCategorizedSuggestions,
} from './interaction-helpers.js'
import { logger } from './logger.js'
import { parseProposedName } from './rename.js'
import {
  closePreview,
  formatAiFeedback,
  formatMethod,
  openPreview,
  sanitizeUserInput,
  showInputDialog,
} from './ui.js'
import { ensureObject } from './utilities.js'

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

function handleSmartInput(input, context) {
  const { updatedText, hasShortcuts, newCurrent } = applyCategorizedSelection(
    input,
    context.suggestions,
    context.current
  )

  if (hasShortcuts) {
    context.current = newCurrent
    return updatedText === ''
      ? { type: 'shortcut' }
      : { type: 'manual', text: updatedText }
  }

  return { type: 'manual', text: input }
}

function processAction(result, context) {
  if (result === undefined) throw new Error('Operace zrušena (Zrušit/Escape)')
  const { button, text } = result
  const input = text.trim()
  const lowerInput = input.toLowerCase()

  if (button === 'SKIP' || button === 'CANCEL' || lowerInput === '/skip') {
    return { type: 'skip' }
  }
  if (button === 'OK' && (lowerInput === '/ok' || lowerInput === '')) {
    return { type: 'done' }
  }
  if (lowerInput.startsWith('/ai ')) return { type: 'ai_prompt' }

  return handleSmartInput(input, context)
}

function formatPrompt(parameters) {
  const { current, fileName, dashboard, pageStats, batchStats } = parameters
  const header = formatAiFeedback(current.vision_check)
  const method = formatMethod(current.method)
  const batchInfo = batchStats ? `[${batchStats}] ` : ''
  const legend = '\n\n💡 Příkazy: /1-9 (výběr), /ai (nápověda), /ok, /skip'
  return `${header}📄 ${batchInfo}${pageStats}  |  Soubor: ${fileName}\n${method}${dashboard}\n\nUpravte název (Enter pro OK, tlačítko pro přeskočení):${legend}`
}

function getDialogAction(parameters) {
  const { current, fileName, pageStats, absPath, batchStats } = parameters
  const suggestions = getCategorizedSuggestions(current)
  const prompt = formatPrompt({
    current,
    fileName,
    dashboard: buildDashboard(suggestions),
    pageStats,
    batchStats,
  })
  const dialogResult = showInputDialog(
    prompt,
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
  if (action.type === 'done') {
    return { company: current.company || 'null', discovery: current }
  }

  const rawInput = action.text || dialogResult.text
  const sanitizedInput = sanitizeUserInput(rawInput)
  const parsed = parseProposedName(sanitizedInput)

  const final = {
    ...current,
    date: parsed.date || current.date,
    company: parsed.company || current.company,
    title: parsed.title || current.title,
  }

  return { company: final.company || 'null', discovery: final }
}

async function handleIterativeLoop(parameters, state) {
  const { absPath, discovery, pages, fileIndex, totalFiles } = parameters
  const fileName = path.basename(absPath)
  const safePagesLength = pages?.length ?? 0
  const pageStats = `Stránky: ${discovery.pagesAnalyzed ?? Math.min(safePagesLength, 3)}/${safePagesLength}`
  const batchStats =
    typeof fileIndex === 'number' && typeof totalFiles === 'number'
      ? `Soubor ${fileIndex}/${totalFiles}`
      : ''

  let iterations = 0
  while (true) {
    iterations += 1
    assertWithinInteractionLimit(iterations)
    const { action, dialogResult } = getDialogAction({
      current: state.current,
      fileName,
      pageStats,
      absPath,
      batchStats,
    })
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
 * @param {number} [parameters.fileIndex] - Index of current file in batch.
 * @param {number} [parameters.totalFiles] - Total files in batch.
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
