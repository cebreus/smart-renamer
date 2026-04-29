/**
 * @file LLM integration for document analysis and metadata extraction.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { CONFIG } from './config.js'
import {
  createSystemPrompt,
  isLocalhostUrl,
  logRequestPayload,
  logResponsePayload,
  throwApiError,
} from './llm-internals.js'
import { extractJson } from './llm-json-parser.js'
import { buildSessionContextBlock, updateSession } from './llm-session.js'
import { logger } from './logger.js'
import { ensureObject, redactImageUrls } from './utilities.js'

const DEFAULT_TEMPERATURE = 0
const EXPECTED_RESULT_FIELDS = ['company', 'title', 'date', 'vision_check']

function getSessionLimits() {
  return {
    maxSummaryChars: CONFIG.AI_SESSION_MAX_SUMMARY_CHARS,
    maxTurns: CONFIG.AI_SESSION_MAX_TURNS,
  }
}

function hasExpectedResultFields(result) {
  return (
    result && EXPECTED_RESULT_FIELDS.some((key) => Object.hasOwn(result, key))
  )
}

function processInferenceResult({
  result,
  pageCount,
  userPrompt,
  session,
  limits,
}) {
  if (!hasExpectedResultFields(result)) {
    logger.warn(`AI přetížena, snižuji počet stran na ${pageCount - 1}...`)
    return undefined
  }

  if (!session) {
    logger.warn('Chybí AI session, přeskakuji její aktualizaci')
    return { ...result, pagesAnalyzed: pageCount }
  }

  updateSession(session, userPrompt, result, limits)
  return { ...result, pagesAnalyzed: pageCount }
}

function getInferenceErrorDetails(controller, error) {
  const abortReason = controller.signal.reason
  return abortReason?.message || error?.message || String(abortReason || error)
}

function logSessionContextStats(session, pageCount) {
  const historyTurns = session?.history?.length || 0
  const summaryChars = session?.summary?.length || 0
  logger.debug(
    `Kontext AI session: kola=${historyTurns}, znaků v souhrnu=${summaryChars}, stran=${pageCount}`
  )
}

function createUserMessage(originalName, userPrompt, session) {
  const sessionContext = buildSessionContextBlock(session)
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Soubor: ${originalName}\n${userPrompt ? 'DOPLŇUJÍCÍ INSTRUKCE: ' + userPrompt + '\n' : ''}${sessionContext}\n\nObsah:`,
      },
    ],
  }
}

async function maybeAttachPageImage(userMessage, page) {
  if (!page.imagePath) return

  try {
    const imageBuffer = await readFile(page.imagePath)
    const base64 = imageBuffer.toString('base64')

    // Detect MIME type based on file extension
    const extension = path.extname(page.imagePath).slice(1).toLowerCase()
    const mimeTypeMap = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const resolvedMimeType = mimeTypeMap[extension]
    const mimeType = resolvedMimeType || 'image/png'
    if (!resolvedMimeType) {
      logger.debug(
        `Unknown image extension for OCR page (${page.imagePath}), defaulting MIME to image/png`
      )
    }

    userMessage.content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64}` },
    })
  } catch (error) {
    logger.debug(
      `Skipping unreadable page image (${page.imagePath}): ${error.message}`
    )
  }
}

async function constructMessages(pages, pageCount, userMessage) {
  const now = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })
  const analyzedCount = Math.min(pages.length, pageCount)
  const messages = [
    {
      role: 'system',
      content: createSystemPrompt(now, analyzedCount, pages.length),
    },
    userMessage,
  ]

  for (let index = 0; index < analyzedCount; index += 1) {
    const page = pages[index]
    userMessage.content.push({
      type: 'text',
      text: `\n[Strana ${index + 1} OCR]:\n${(page.text || '').slice(0, 2000)}`,
    })
    await maybeAttachPageImage(userMessage, page)
  }
  return messages
}

async function performInference(messages, signal) {
  const redacted = redactImageUrls(messages)
  logRequestPayload(logger, CONFIG.TRACE_VERBOSE, redacted)

  const response = await fetch(CONFIG.LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages,
      temperature: CONFIG.TEMPERATURE ?? DEFAULT_TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
    }),
    signal,
  })

  if (!response.ok) await throwApiError(response)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return undefined
  logResponsePayload(logger, CONFIG.TRACE_VERBOSE, content)
  const result = extractJson(content)
  if (result) return result
  return undefined
}

function createInferenceTimeout(pageCount) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(
        `LLM timeout after ${CONFIG.LLM_TIMEOUT_MS}ms while analyzing ${pageCount} pages`
      )
    )
  }, CONFIG.LLM_TIMEOUT_MS)
  return { controller, timeoutId }
}

async function analyzeDocumentAttempt(parameters, pageCount, session, limits) {
  const { pages, originalName, userPrompt } = parameters
  const { controller, timeoutId } = createInferenceTimeout(pageCount)
  try {
    logSessionContextStats(session, pageCount)
    const userMessage = createUserMessage(originalName, userPrompt, session)
    const messages = await constructMessages(pages, pageCount, userMessage)
    const result = await performInference(messages, controller.signal)
    return processInferenceResult({
      result,
      pageCount,
      userPrompt,
      session,
      limits,
    })
  } catch (error) {
    const details = getInferenceErrorDetails(controller, error)
    logger.debug(`Pokus o inferenci selhal (${pageCount} stran): ${details}`)
    return undefined
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Analyzes multi-page document data with dynamic context reduction.
 * @typedef {object} InferenceResult
 * @property {string} [company] - Detected company name.
 * @property {string[]} [company_suggestions] - Company suggestions.
 * @property {string} [title] - Detected document title.
 * @property {string[]} [title_suggestions] - Title suggestions.
 * @property {string} [date] - Detected date (YYYY-MM-DD).
 * @property {string[]} [date_suggestions] - Date suggestions.
 * @property {string} [vision_check] - AI feedback on document readability.
 * @property {number} [pagesAnalyzed] - Number of pages actually processed.
 * @param {object} parameters - Input parameters.
 * @param {Array<object>} parameters.pages - OCR pages with text and images.
 * @param {string} parameters.originalName - Original filename for context.
 * @param {string} [parameters.userPrompt] - Optional user instruction.
 * @param {object} [parameters.session] - Per-file AI session state.
 * @returns {Promise<InferenceResult|undefined>} Result object with extracted data.
 */
export async function analyzeDocument(parameters) {
  ensureObject(parameters, 'parameters')
  if (!isLocalhostUrl(CONFIG.LM_STUDIO_URL))
    throw new Error('Security Violation')

  const { pages, session } = parameters
  let pageCount = Math.min(pages.length, CONFIG.RENDER_MAX_PAGES)
  const limits = getSessionLimits()

  while (pageCount >= 1) {
    const result = await analyzeDocumentAttempt(
      parameters,
      pageCount,
      session,
      limits
    )
    if (result) return result
    pageCount -= 1
  }
  return undefined
}
