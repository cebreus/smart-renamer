import { readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { logger } from './logger.js'

function isLocalhost(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

function constructMessages(pages, originalName, userPrompt) {
  const messages = [
    {
      role: 'system',
      content:
        'Jsi expertní archivář. Analyzuj strany a vrať JSON: {"company": string, "title": string, "date": "YYYY-MM-DD", "vision_check": string}.\nPravidla:\n1. Title nesmí obsahovat datum ani firmu.\n2. Pokud uživatel pošle dotaz, prioritizuj jeho instrukci.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Soubor: ${originalName}\n${userPrompt ? 'DOPLŇUJÍCÍ INSTRUKCE: ' + userPrompt + '\n' : ''}\nObsah:`,
        },
      ],
    },
  ]

  for (let index = 0; index < Math.min(pages.length, 3); index += 1) {
    const page = pages[index]
    messages[1].content.push({
      type: 'text',
      text: `\n[Strana ${index + 1} OCR]:\n${page.text.slice(0, 2000)}`,
    })
    if (page.imagePath) {
      try {
        const base64 = readFileSync(page.imagePath).toString('base64')
        messages[1].content.push({
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

async function performInference(messages, signal) {
  logger.debug('Odesílám dotaz na AI...')
  const response = await fetch(CONFIG.LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages,
      temperature: 0,
      max_tokens: CONFIG.MAX_TOKENS,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`API Error ${response.status}`)
  }
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
 * Analyzes multi-page document data.
 * @param {object} params - Input parameters.
 * @param {Array<object>} params.pages - OCR pages with text and images.
 * @param {string} params.originalName - Original filename for context.
 * @param {string} [params.userPrompt] - Optional user instruction.
 * @returns {Promise<object|undefined>} Result object with extracted data.
 */
export async function analyzeDocument({ pages, originalName, userPrompt }) {
  if (!isLocalhost(CONFIG.LM_STUDIO_URL)) {
    throw new Error('Security Violation')
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.LLM_TIMEOUT_MS)
  try {
    return await performInference(
      constructMessages(pages, originalName, userPrompt),
      controller.signal
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
