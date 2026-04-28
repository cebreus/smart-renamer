import { CONFIG } from './config.js'
import { analyzeDocument } from './llm.js'
import { logger } from './logger.js'
import { extractDateFallback } from './utilities.js'

export function createDiscoverySession() {
  return { history: [], summary: '' }
}

export function clearDiscoverySession(session) {
  if (!session) return
  session.history = []
  session.summary = ''
}

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
 * @param {object} params - Discovery input.
 * @param {Array<object>} params.pages - OCR pages to scan.
 * @param {string} params.originalName - Original file name.
 * @param {string} [params.userPrompt] - Extra user instruction (optional).
 * @param {object} [params.aiSession] - Per-file AI session state.
 * @returns {Promise<object>} Normalised discovery result.
 */
export async function runDiscovery({
  pages,
  originalName,
  userPrompt,
  aiSession,
}) {
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
 * Gets discovery from OCR pages.
 * @param {Array<object>} pages - OCR pages.
 * @param {string} originalNameOnly - Original file name hint.
 * @param {object} [aiSession] - Per-file AI session state.
 * @returns {Promise<object>} Discovery result or fallback.
 */
export async function getDiscovery(pages, originalNameOnly, aiSession) {
  const fullText = pages.map((p) => p.text).join('\n')
  const canRunAI = fullText.trim().length >= CONFIG.OCR_MIN_CHARS
  if (!canRunAI) return { method: 'fallback' }
  return runDiscovery({ pages, originalName: originalNameOnly, aiSession })
}

function mergeSuggestions(primary, list, extra, hint) {
  const all = [primary, ...(list || []), extra, hint].filter(Boolean)
  const seen = new Set()
  const result = []
  for (const item of all) {
    const normalized = item.toLowerCase().trim()
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
 * @param {object} params - Input values.
 * @param {object} params.registryMatch - Registry lookup result.
 * @param {object} params.discovery - AI text extraction result.
 * @param {object|undefined} params.cached - Saved file details.
 * @param {string} params.fullText - OCR text extraction.
 * @param {object} params.hint - Parsed filename hint.
 * @returns {object} Final merged file details.
 */
export function mergeResults({
  registryMatch,
  discovery,
  cached,
  fullText,
  hint,
}) {
  const fallbackDate = extractDateFallback(fullText)
  const method = getFinalMethod(
    cached,
    Boolean(registryMatch.company),
    discovery.method
  )

  return {
    ...discovery,
    ...buildCompanyFields(discovery, registryMatch, cached, hint),
    ...buildTitleFields(discovery, registryMatch, cached, hint),
    ...buildDateFields(discovery, cached, fallbackDate, hint),
    method,
  }
}
