/**
 * @file Helpers for interactive selection and dashboard building.
 */

import { assembleFilename, getMtimeDate } from './rename.js'

function filterCurrent(list, current) {
  const normalizedCurrent = (current || '').toLowerCase().trim()
  return (list || []).filter(
    (item) => item.toLowerCase().trim() !== normalizedCurrent
  )
}

function formatRow(emoji, items, startNumber) {
  if (items.length === 0) return ''
  const formatted = items
    .map((item, index) => `/${startNumber + index} ${item}`)
    .join('  |  ')
  return `\n${emoji}  ${formatted}`
}

/**
 * Extracts and categorizes suggestions from current state.
 * @param {object} current - Current state.
 * @returns {object} Categorized suggestions.
 */
export function getCategorizedSuggestions(current) {
  if (!current || typeof current !== 'object') {
    return { dates: [], companies: [], titles: [] }
  }
  return {
    dates: filterCurrent(current.date_suggestions, current.date).slice(0, 3),
    companies: filterCurrent(
      current.company_suggestions,
      current.company
    ).slice(0, 3),
    titles: filterCurrent(current.title_suggestions, current.title).slice(0, 3),
  }
}

/**
 * Builds dashboard text from suggestions.
 * @param {object} suggestions - Suggestions object.
 * @returns {string} Dashboard text.
 */
export function buildDashboard(suggestions) {
  if (!suggestions || typeof suggestions !== 'object') {
    throw new Error('Invalid suggestions object passed to buildDashboard')
  }
  const dates = formatRow('📅', suggestions.dates, 1)
  const companies = formatRow('🏢', suggestions.companies, 4)
  const titles = formatRow('📝', suggestions.titles, 7)
  return `${dates}${companies}${titles}`
}

/**
 * Applies shortcut selections to current state.
 * @param {string} userInput - Raw user input.
 * @param {object} suggestions - Current suggestions.
 * @param {object} current - Current state.
 * @returns {{updatedText: string, hasShortcuts: boolean, newCurrent: object}} Result of selection.
 */
export function applyCategorizedSelection(userInput, suggestions, current) {
  if (typeof userInput !== 'string' || !suggestions || !current) {
    throw new Error('Invalid parameters passed to applyCategorizedSelection')
  }
  const shortcutRegex = /\/([1-9])/g
  const shortcuts = [...userInput.matchAll(shortcutRegex)]
  const newCurrent = { ...current }
  if (shortcuts.length === 0) {
    return { updatedText: userInput, hasShortcuts: false, newCurrent }
  }

  const ranges = [
    { start: 1, end: 3, key: 'date', values: suggestions.dates },
    { start: 4, end: 6, key: 'company', values: suggestions.companies },
    { start: 7, end: 9, key: 'title', values: suggestions.titles },
  ]

  for (const match of shortcuts) {
    const index = Number.parseInt(match[1], 10)
    const selected = ranges.find(
      (range) => index >= range.start && index <= range.end
    )
    if (selected) {
      const offset = index - selected.start
      const value = selected.values[offset]
      if (value) newCurrent[selected.key] = value
    }
  }

  const updatedText = userInput.replaceAll(shortcutRegex, '').trim()
  return { updatedText, hasShortcuts: true, newCurrent }
}

/**
 * Builds proposed filename for the dialog.
 * @param {object} current - Current discovery state.
 * @param {string} absPath - Absolute file path.
 * @returns {string} Proposed filename.
 */
export function buildProposedName(current, absPath) {
  if (
    !current ||
    typeof current !== 'object' ||
    !absPath ||
    typeof absPath !== 'string'
  ) {
    throw new Error('Invalid parameters passed to buildProposedName')
  }
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
