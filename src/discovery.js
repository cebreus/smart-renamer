/**
 * @file High-level discovery logic for aggregating OCR and AI results.
 */

import { CONFIG } from './config.js'
import { analyzeDocument } from './llm.js'
import { logger } from './logger.js'
import {
  ensureArray,
  ensureObject,
  ensureString,
  extractDateFallback,
} from './utilities.js'

const NORMALIZED_VALUE_BLOCKLIST = new Set(
  (CONFIG.VALUE_BLOCKLIST || []).map((value) =>
    String(value).toLowerCase().trim()
  )
)

function normalizeValue(value) {
  if (!value || value === 'null') return undefined
  return String(value).trim()
}

function mapSuggestions(result) {
  return {
    company_suggestions: result?.company_suggestions || [],
    title_suggestions: result?.title_suggestions || [],
    date_suggestions: result?.date_suggestions || [],
  }
}

function mapAiResult(result) {
  const suggestions = mapSuggestions(result)
  return {
    company: normalizeValue(result?.company),
    title: normalizeValue(result?.title),
    date: normalizeValue(result?.date),
    vision_check: normalizeValue(result?.vision_check),
    ...suggestions,
    method: 'ai',
  }
}

/**
 * Runs AI discovery over OCR pages.
 * @typedef {object} DiscoveryResult
 * @property {string} [company] - Detected company.
 * @property {string} [title] - Detected title.
 * @property {string} [date] - Detected date.
 * @property {string} [vision_check] - AI feedback.
 * @property {string[]} [company_suggestions] - Company suggestions.
 * @property {string[]} [title_suggestions] - Title suggestions.
 * @property {string[]} [date_suggestions] - Date suggestions.
 * @property {string} method - Extraction method ('ai', 'fallback', 'registry', 'cache').
 * @property {string} [error] - Error message if failed.
 * @param {object} parameters - Discovery input.
 * @param {Array<object>} parameters.pages - OCR pages to scan.
 * @param {string} parameters.originalName - Original file name.
 * @param {string} [parameters.userPrompt] - Extra user instruction (optional).
 * @param {object} [parameters.aiSession] - Per-file AI session state.
 * @returns {Promise<DiscoveryResult>} Normalised discovery result.
 */
export async function runDiscovery(parameters) {
  ensureObject(parameters, 'parameters')
  const { pages, originalName, userPrompt, aiSession } = parameters
  const status = userPrompt ? 'Upřesňuji analýzu...' : 'Analýza dokumentu...'
  logger.status(2, status)
  try {
    const aiResult = await analyzeDocument({
      pages,
      originalName,
      userPrompt,
      session: aiSession,
    })
    return mapAiResult(aiResult)
  } catch (error) {
    const errorDetails = error?.stack || String(error)
    const publicError = error?.message || 'Internal error'
    logger.error(`AI selhala: ${errorDetails}`)
    return { method: 'fallback', error: publicError }
  }
}

/**
 * Gets discovery from OCR pages when the minimum character limit is met.
 * @param {Array<object>} pages - OCR pages.
 * @param {string} originalNameOnly - Original file name hint.
 * @param {object} [aiSession] - Per-file AI session state.
 * @param {number} [minChars] - Optional minimum character limit.
 * @returns {Promise<DiscoveryResult>} Discovery result or fallback.
 */
export async function getDiscovery(
  pages,
  originalNameOnly,
  aiSession,
  minChars = CONFIG.OCR_MIN_CHARS
) {
  ensureArray(pages, 'pages')
  ensureString(originalNameOnly, 'originalNameOnly')
  // ensureArray guarantees pages is an array; only check for emptiness
  if (pages.length === 0) {
    return { method: 'fallback' }
  }
  const fullText = pages.map((p) => p.text || '').join('\n')
  const canRunAI = fullText.trim().length >= (minChars ?? 0)
  if (!canRunAI) return { method: 'fallback' }
  return runDiscovery({ pages, originalName: originalNameOnly, aiSession })
}

function mergeSuggestions(primary, list, extra, hint) {
  const all = [primary, ...(list || []), extra, hint].filter(
    (item) => item !== undefined
  )
  const seen = new Set()
  const result = []
  for (const item of all) {
    const normalized = String(item).toLowerCase().trim()
    if (
      normalized === '' ||
      normalized === 'null' ||
      normalized === 'undefined' ||
      NORMALIZED_VALUE_BLOCKLIST.has(normalized)
    ) {
      continue
    }
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(item)
    }
  }
  return result
}

function getMergedField(primary, secondary, tertiary, fallback) {
  return primary || secondary || tertiary || fallback
}

function getFinalMethod(cached, isRegistry, discoveryMethod) {
  if (cached) return 'cache'
  if (isRegistry) return 'registry'
  return discoveryMethod
}

function buildCompanyFields(discovery, registryMatch, cached, hint) {
  return {
    company: getMergedField(
      cached?.company,
      registryMatch?.company,
      discovery?.company,
      hint?.company
    ),
    company_suggestions: mergeSuggestions(
      registryMatch?.company,
      discovery?.company_suggestions,
      cached?.company,
      hint?.company
    ),
  }
}

function buildTitleFields(discovery, registryMatch, cached, hint) {
  return {
    title: getMergedField(
      cached?.title,
      registryMatch?.title,
      discovery?.title,
      hint?.title
    ),
    title_suggestions: mergeSuggestions(
      registryMatch?.title,
      discovery?.title_suggestions,
      cached?.title,
      hint?.title
    ),
  }
}

function buildDateFields(discovery, cached, fallbackDate, hint) {
  return {
    date: getMergedField(
      cached?.date,
      discovery?.date,
      fallbackDate || hint?.date
    ),
    date_suggestions: mergeSuggestions(
      discovery?.date,
      discovery?.date_suggestions,
      cached?.date || fallbackDate,
      hint?.date
    ),
  }
}

/**
 * Merges all values into one output object.
 * @param {object} parameters - Input values.
 * @param {object} parameters.registryMatch - Registry lookup result.
 * @param {DiscoveryResult} parameters.discovery - AI text extraction result.
 * @param {object|undefined} parameters.cached - Saved file details from cache.
 * @param {string} parameters.fullText - OCR text extraction.
 * @param {object} parameters.hint - Parsed filename hint.
 * @returns {DiscoveryResult} Final merged file details.
 */
export function mergeResults(parameters) {
  ensureObject(parameters, 'parameters')
  const { registryMatch, discovery, cached, fullText, hint } = parameters
  const fallbackDate = extractDateFallback(fullText)
  const safeCompanyFlag = Boolean(registryMatch?.company)
  const safeMethod = discovery?.method || 'fallback'
  const method = getFinalMethod(cached, safeCompanyFlag, safeMethod)

  return {
    ...discovery,
    ...buildCompanyFields(discovery, registryMatch, cached, hint),
    ...buildTitleFields(discovery, registryMatch, cached, hint),
    ...buildDateFields(discovery, cached, fallbackDate, hint),
    method,
  }
}

/**
 * Creates a fresh discovery session state.
 * @returns {object} New session object with history and summary.
 */
export function createDiscoverySession() {
  return { history: [], summary: '' }
}

/**
 * Clears discovery session state.
 * @param {object|undefined} session - Session to reset; no-op when falsy.
 * @returns {void}
 */
export function clearDiscoverySession(session) {
  if (!session) return
  session.history = []
  session.summary = ''
}
