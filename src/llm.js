import { readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { logError, logWarn } from './logger.js'

/**
 * LLM Inference module for Smart Renamer.
 * Cross-referenced with PRD Section 8.2, FR-05, FR-06 and NFR-04.
 */

/**
 * Validates that the LLM URL points to localhost.
 * @param {string} urlString - The URL to validate.
 * @returns {boolean} - True if localhost.
 */
function isLocalhost(urlString) {
  try {
    const url = new URL(urlString)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

/**
 * Adds image content to messages if path is valid.
 * @param {object[]} messages - Messages array.
 * @param {string|undefined} imagePath - Path to image.
 */
function addImageContent(messages, imagePath) {
  if (!imagePath) return
  try {
    const buffer = readFileSync(imagePath)
    if (buffer.length <= CONFIG.IMAGE_MAX_BYTES) {
      messages[1].content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        },
      })
    }
  } catch {
    // Fallback to text only
  }
}

/**
 * Constructs the message array for the LLM.
 * @param {string} text - OCR text.
 * @param {string|undefined} imagePath - Image path.
 * @param {string} originalName - Original filename.
 * @returns {object[]} - Messages array.
 */
function constructMessages(text, imagePath, originalName) {
  const messages = [
    {
      role: 'system',
      content: `Jsi archivář. Analyzuj dokument (OCR text + obraz + původní název souboru) a vrať JSON:
{
  "company": "Zkrácený název firmy bez právních přípon (např. s.r.o., a.s., Inc., Ltd., GmbH), nebo null",
  "doc_type": "invoice | receipt | payment | contract | statement | screenshot | other",
  "title": "Max 6 slov. Nepoužívej datum, měsíc, rok ani časové období — datum je v názvu souboru zvlášť. Pro faktury/paragony: 2 nejdražší položky + 'a N dalších' pokud >2. Bez SKU, sériových čísel, ™ ® ©. Nebo null pokud nelze určit.",
  "date": "YYYY-MM-DD — datum plnění nebo vystavení, nikoli splatnosti. Rozuměj všem formátům (20.1.2025, 20. ledna 2025, January 20 2025, v Praze dne...). Nebo null pokud datum není v dokumentu."
}

Závazná pravidla:
1. NEVYMÝŠLEJ SI: Pokud si nejsi jistý, vrať null.
2. ZÁKAZ REDUNDANCE: V poli title nesmí být slova jako "Dne", "Roku", "Doklad".
3. ŽÁDNÝ MARKETING: Ignoruj reklamní slogany a slevy.`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Původní název: ${originalName}\n\nOCR Text:\n${text}`,
        },
      ],
    },
  ]

  addImageContent(messages, imagePath)
  return messages
}

/**
 * Performs the actual fetch to LLM API.
 * @param {object[]} messages - Messages array.
 * @param {AbortSignal} signal - Abort signal.
 * @returns {Promise<object|undefined>} - Result object.
 */
async function performInference(messages, signal) {
  const response = await fetch(CONFIG.LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages,
      temperature: CONFIG.TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
      response_format: { type: 'json_object' },
    }),
    signal,
  })

  if (!response.ok)
    throw new Error(`LLM API returned status ${response.status}`)

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (content) {
    const jsonString = content
      .replaceAll('```json', '')
      .replaceAll('```', '')
      .trim()
    return JSON.parse(jsonString)
  }
  return undefined
}

/**
 * Analyzes document data using a local LLM.
 * @param {object} params - Parameters object.
 * @param {string} params.text - OCR text.
 * @param {string|undefined} params.imagePath - Path to the rendered JPG.
 * @param {string} params.originalName - Original filename for context.
 * @returns {Promise<object|undefined>} - Result object or undefined on failure.
 */
export async function analyzeDocument({ text, imagePath, originalName }) {
  if (!isLocalhost(CONFIG.LM_STUDIO_URL)) {
    throw new Error(
      `Security Violation: LM_STUDIO_URL (${CONFIG.LM_STUDIO_URL}) must be localhost.`
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.LLM_TIMEOUT_MS)

  try {
    const messages = constructMessages(text, imagePath, originalName)
    return await performInference(messages, controller.signal)
  } catch (error) {
    if (error.name === 'AbortError') {
      logWarn('LLM Inference timed out after 35s.')
    } else {
      logError(`LLM Inference failed: ${error.message}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
  return undefined
}
