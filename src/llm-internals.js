/**
 * @file Internal logic for LLM communication and prompting.
 */

import { ensureString, summarizeTraceMessages } from './utilities.js'

const SYSTEM_RULES = [
  'Pravidla:',
  '1. DETEKCE ENTIT: Pokud dokument obsahuje více stran/dat, preferuj datum hlavního dokladu. Datum z první strany použij jen když není jasný lepší kandidát.',
  '2. Title: Max 6 slov, bez data/firmy. U vstupenek: název akce a místo.',
  '3. Date: Prioritizuj datum konání (vstupenky) nebo plnění (faktury).',
  '4. Suggestions: striktně odděluj - do date_suggestions dej jen data, do company_suggestions jen firmy.',
  '5. KVALITA A HALUCINACE: Nejdříve vyhodnoť čitelnost. Pokud je OCR text nesrozumitelný (garbled) nebo obrázek nečitelný, NIKDY si data nedomýšlej. V takovém případě nevracej firmu ani datum a v poli "vision_check" na to DŮRAZNĚ upozorni.',
  '6. CHAT: Pole "vision_check" použij jako svou přímou odpověď. Na začátku vždy potvrď počet stran a zhodnoť čitelnost dokumentu (např. "Čitelnost: 90%, vidím 3 strany...").',
].join('\n')

function isLoopbackIPv4(hostname) {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  if (parts[0] !== '127') return false
  return parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255)
}

/**
 * Validates if the given URL points to localhost or loopback.
 * @param {string} url - The URL to validate.
 * @returns {boolean} True if local.
 */
export function isLocalhostUrl(url) {
  ensureString(url, 'url')
  try {
    const hostname = new URL(url).hostname
    return (
      hostname === 'localhost' ||
      hostname === '::1' ||
      isLoopbackIPv4(hostname) ||
      hostname.startsWith('::ffff:127.')
    )
  } catch {
    return false
  }
}

/**
 * Creates the system prompt for document analysis.
 * @param {string} now - Current timestamp string.
 * @param {number} analyzedCount - Number of pages being analyzed.
 * @param {number} totalPages - Total number of pages in document.
 * @returns {string} Formatted system prompt.
 */
export function createSystemPrompt(now, analyzedCount, totalPages) {
  return (
    `Jsi expertní archivář. Aktuální čas a datum je ${now}. Analyzuješ ${analyzedCount} stran z celkových ${totalPages}. Vrať JSON: {"company": string, "company_suggestions": string[], "title": string, "title_suggestions": string[], "date": "YYYY-MM-DD", "date_suggestions": string[], "vision_check": string}.\n` +
    SYSTEM_RULES
  )
}

/**
 * Logs the AI request payload.
 * @param {object} logger - Logger instance.
 * @param {function(string): void} logger.debug - Writes debug output.
 * @param {boolean} traceVerbose - Whether to log full payload.
 * @param {Array<{role: string, content: unknown}>} redacted - Redacted messages object.
 * @returns {void}
 */
export function logRequestPayload(logger, traceVerbose, redacted) {
  if (traceVerbose) {
    logger.debug(`AI POŽADAVEK: ${JSON.stringify(redacted, undefined, 2)}`)
    return
  }
  const summary = summarizeTraceMessages(redacted)
  logger.debug(`AI POŽADAVEK (souhrn): ${JSON.stringify(summary)}`)
}

/**
 * Logs the AI response content.
 * @param {object} logger - Logger instance.
 * @param {function(string): void} logger.debug - Writes debug output.
 * @param {boolean} traceVerbose - Whether to log full response.
 * @param {string} content - Raw AI response string.
 * @returns {void}
 */
export function logResponsePayload(logger, traceVerbose, content) {
  if (traceVerbose) {
    const preview = content.slice(0, 500)
    const ellipsis = content.length > 500 ? '...' : ''
    logger.debug(`SUROVÁ ODPOVĚĎ AI: ${preview}${ellipsis}`)
    return
  }
  logger.debug(`SUROVÁ ODPOVĚĎ AI (souhrn): chars=${content.length}`)
}

async function getResponseBodySafe(response) {
  try {
    const bodyText = await response.text()
    return bodyText.trim()
  } catch {
    return ''
  }
}

/**
 * Throws a detailed API error from a fetch response.
 * @param {Response} response - Fetch response object.
 * @returns {Promise<never>} Always throws an error.
 * @throws {Error} Detailed API error.
 */
export async function throwApiError(response) {
  const body = await getResponseBodySafe(response)
  throw new Error(
    body
      ? `API Error ${response.status}: ${body}`
      : `API Error ${response.status}`
  )
}
