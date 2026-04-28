/**
 * @file Interactive user input handling for name refinement.
 */
import path from 'node:path'

import { assembleFilename, getMtimeDate, parseProposedName } from './rename.js'
import {
  closePreview,
  openPreview,
  sanitizeUserInput,
  showInputDialog,
} from './ui.js'

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
  const index = Number.parseInt(userInput, 10)
  if (Number.isNaN(index)) return false

  const ranges = [
    { start: 1, end: 3, key: 'date', values: suggestions.dates },
    { start: 4, end: 6, key: 'company', values: suggestions.companies },
    { start: 7, end: 9, key: 'title', values: suggestions.titles },
  ]
  const selected = ranges.find(
    (range) => index >= range.start && index <= range.end
  )
  if (!selected) return false

  const offset = index - selected.start
  const value = selected.values[offset]
  if (!value) return false

  current[selected.key] = value
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

  const input = result.text.trim().toLowerCase()
  if (result.button === 'OK' && (input === '/ok' || input === ''))
    return { type: 'done' }
  if (input === '/skip') return { type: 'skip' }
  if (input.startsWith('/ai ')) return { type: 'ai_prompt' }
  if (
    applyCategorizedSelection(result.text, context.suggestions, context.current)
  )
    return { type: 'shortcut' }
  return { type: 'manual' }
}

function formatAiFeedback(visionCheck) {
  if (!visionCheck) return ''
  const lower = visionCheck.toLowerCase()
  const isWarning =
    lower.includes('nečitelný') ||
    lower.includes('garbled') ||
    lower.includes('čitelnost: [0-5]')
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

/**
 * Runs iterative manual refinement for discovered file metadata.
 * @param {object} params - Input parameters.
 * @param {string} params.absPath - Absolute file path.
 * @param {object} params.discovery - Initial discovery payload.
 * @param {Array<object>} params.pages - OCR page data.
 * @param {string} params.originalNameOnly - Original filename without extension.
 * @param {(params: object) => Promise<object>} params.runDiscovery - Discovery function for /ai prompts.
 * @param {object} [params.aiSession] - Per-file AI session state.
 * @returns {Promise<object>} Final company and merged discovery object.
 */
export async function handleIterativeInput({
  absPath,
  aiSession,
  discovery,
  pages,
  originalNameOnly,
  runDiscovery,
}) {
  let current = discovery
  const fileName = path.basename(absPath)
  const pageStats = `${discovery.pagesAnalyzed ?? Math.min(pages.length, 3)}/${pages.length}`
  openPreview(absPath)
  try {
    while (true) {
      const { action, dialogResult } = getDialogAction(
        current,
        fileName,
        pageStats,
        absPath
      )
      if (action.type === 'ai_prompt') {
        current = await handleAiPrompt(dialogResult.text, {
          aiSession,
          pages,
          originalNameOnly,
          runDiscovery,
          current,
        })
        continue
      }
      if (action.type === 'shortcut') continue
      if (action.type === 'skip') throw new Error('Soubor přeskočen uživatelem')
      closePreview(fileName)
      const final =
        action.type === 'done'
          ? current
          : parseProposedName(sanitizeUserInput(dialogResult.text))
      return {
        company:
          final.company ||
          current.company ||
          sanitizeUserInput(dialogResult.text),
        discovery: { ...current, ...final },
      }
    }
  } finally {
    closePreview(fileName)
  }
}
