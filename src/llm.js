import { readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { buildSessionContextBlock, updateSession } from './llm-session.js'
import { logger } from './logger.js'

const DEFAULT_TEMPERATURE = 0.7
const EXPECTED_RESULT_FIELDS = ['company', 'title', 'date', 'vision_check']

function getSessionLimits() {
  return {
    maxSummaryChars: CONFIG.AI_SESSION_MAX_SUMMARY_CHARS,
    maxTurns: CONFIG.AI_SESSION_MAX_TURNS,
  }
}

function getJsonStart(content) {
  const startArray = content.indexOf('[')
  const startObject = content.indexOf('{')
  const hasArray =
    startArray !== -1 && (startObject === -1 || startArray < startObject)
  return hasArray ? startArray : startObject
}

function createJsonParserState() {
  return {
    depth: 0,
    isEscaped: false,
    inString: false,
  }
}

function updateStringState(char, state) {
  if (!state.inString) {
    if (char === '"') {
      state.inString = true
      return true
    }
    return false
  }

  if (state.isEscaped) {
    state.isEscaped = false
    return true
  }
  if (char === '\\') {
    state.isEscaped = true
    return true
  }
  if (char === '"') state.inString = false
  return state.inString
}

function updateDepth(char, state) {
  if (char === '{' || char === '[') {
    state.depth += 1
    return false
  }
  if (char === '}' || char === ']') {
    state.depth -= 1
    return state.depth === 0
  }
  return false
}

function findJsonEnd(content, start) {
  const state = createJsonParserState()
  for (let index = start; index < content.length; index += 1) {
    const char = content[index]
    if (updateStringState(char, state)) continue
    if (updateDepth(char, state)) return index
  }
  return -1
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

function isLocalhost(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
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

function constructMessages(pages, pageCount, userMessage) {
  const now = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })
  const analyzedCount = Math.min(pages.length, pageCount)
  const messages = [
    {
      role: 'system',
      content:
        `Jsi expertní archivář. Aktuální čas a datum je ${now}. Analyzuješ ${analyzedCount} stran z celkových ${pages.length}. Vrať JSON: {"company": string, "company_suggestions": string[], "title": string, "title_suggestions": string[], "date": "YYYY-MM-DD", "date_suggestions": string[], "vision_check": string}.\n` +
        'Pravidla:\n' +
        `1. DETEKCE ENTIT: Pokud PDF obsahuje více dokumentů, jako hlavní vyber tu entitu, jejíž datum NALEZENÉ V TEXTU je NEJBLIŽŠÍ k aktuálnímu času (${now}). Nikdy nepoužívej aktuální datum jako výsledek, pokud není přímo v textu.\n` +
        '2. Title: Max 6 slov, bez data/firmy. U vstupenek: název akce a místo.\n' +
        '3. Date: Prioritizuj datum konání (vstupenky) nebo plnění (faktury).\n' +
        '4. Suggestions: striktně odděluj - do date_suggestions dej jen data, do company_suggestions jen firmy.\n' +
        '5. KVALITA A HALUCINACE: Nejdříve vyhodnoť čitelnost. Pokud je OCR text nesrozumitelný (garbled) nebo obrázek nečitelný, NIKDY si data nedomýšlej. V takovém případě nevracej firmu ani datum a v poli "vision_check" na to DŮRAZNĚ upozorni.\n' +
        '6. CHAT: Pole "vision_check" použij jako svou přímou odpověď. Na začátku vždy potvrď počet stran a zhodnoť čitelnost dokumentu (např. "Čitelnost: 90%, vidím 3 strany...").',
    },
    userMessage,
  ]

  for (let index = 0; index < analyzedCount; index += 1) {
    const page = pages[index]
    userMessage.content.push({
      type: 'text',
      text: `\n[Strana ${index + 1} OCR]:\n${page.text.slice(0, 2000)}`,
    })
    if (page.imagePath) {
      try {
        const base64 = readFileSync(page.imagePath).toString('base64')
        userMessage.content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        })
      } catch {
        /* Skip */
      }
    }
  }
  return messages
}

function extractJson(content) {
  const start = getJsonStart(content)
  if (start === -1) return undefined

  try {
    const end = findJsonEnd(content, start)

    if (end === -1) return undefined

    const raw = content.slice(start, end + 1)
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? parsed[0] : undefined
    }
    return parsed
  } catch (error) {
    logger.debug(
      `Chyba parsování JSON: ${error.message}. Konec obsahu: ${content.slice(-50)}`
    )
    return undefined
  }
}

async function performInference(messages, signal) {
  const redacted = messages.map((m) => ({
    ...m,
    content: Array.isArray(m.content)
      ? m.content.map((c) =>
          c.type === 'image_url'
            ? { type: 'image_url', image_url: { url: '[REDACTED]' } }
            : c
        )
      : m.content,
  }))
  logger.debug(`AI POŽADAVEK: ${JSON.stringify(redacted, undefined, 2)}`)

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

  if (!response.ok) throw new Error(`API Error ${response.status}`)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (content) {
    logger.debug(`SUROVÁ ODPOVĚĎ AI: ${content.slice(0, 500)}...`)
    const result = extractJson(content)
    if (result) return result
  }
  return undefined
}

/**
 * Analyzes multi-page document data with dynamic context reduction.
 * @param {object} params - Input parameters.
 * @param {Array<object>} params.pages - OCR pages with text and images.
 * @param {string} params.originalName - Original filename for context.
 * @param {string} [params.userPrompt] - Optional user instruction.
 * @param {object} [params.session] - Per-file AI session state.
 * @returns {Promise<object|undefined>} Result object with extracted data.
 */
export async function analyzeDocument({
  pages,
  originalName,
  userPrompt,
  session,
}) {
  if (!isLocalhost(CONFIG.LM_STUDIO_URL)) throw new Error('Security Violation')

  let pageCount = Math.min(pages.length, CONFIG.RENDER_MAX_PAGES)
  const { maxTurns, maxSummaryChars } = getSessionLimits()

  while (pageCount >= 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort(
        new Error(
          `LLM timeout after ${CONFIG.LLM_TIMEOUT_MS}ms while analyzing ${pageCount} pages`
        )
      )
    }, CONFIG.LLM_TIMEOUT_MS)
    try {
      logSessionContextStats(session, pageCount)
      const userMessage = createUserMessage(originalName, userPrompt, session)
      const messages = constructMessages(pages, pageCount, userMessage)
      const result = await performInference(messages, controller.signal)
      const normalized = processInferenceResult({
        result,
        pageCount,
        userPrompt,
        session,
        limits: { maxTurns, maxSummaryChars },
      })
      if (normalized) return normalized
    } catch (error) {
      const details = getInferenceErrorDetails(controller, error)
      logger.debug(`Pokus o inferenci selhal (${pageCount} stran): ${details}`)
    } finally {
      clearTimeout(timeoutId)
    }
    pageCount -= 1
  }
  return undefined
}
