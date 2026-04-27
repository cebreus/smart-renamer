/**
 * @file Module for AI analysis of documents.
 */
import { readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { logger } from './logger.js'

function isLocalhost(urlString) {
  try {
    const url = new URL(urlString)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

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

  if (imagePath) {
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
      void 0
    }
  }

  return messages
}

async function performInference(messages, signal) {
  logger.debug(
    `Odesílám dotaz na AI (${messages[1].content[0].text.length} znaků textu)...`
  )
  const response = await fetch(CONFIG.LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages,
      temperature: CONFIG.TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`API vrátilo chybu ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  logger.debug(`Odpověď AI: "${content?.slice(0, 100)}..."`)
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
 * Analyses document using LLM.
 * @param {object} params - Analysis parameters.
 * @param {string} params.text - OCR text.
 * @param {string|undefined} params.imagePath - Image path.
 * @param {string} params.originalName - Original name.
 * @returns {Promise<object|undefined>} LLM result.
 */
export async function analyzeDocument({ text, imagePath, originalName }) {
  if (!isLocalhost(CONFIG.LM_STUDIO_URL)) {
    throw new Error(
      `Zabezpečení: Adresa AI (${CONFIG.LM_STUDIO_URL}) musí být localhost.`
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.LLM_TIMEOUT_MS)

  try {
    const messages = constructMessages(text, imagePath, originalName)
    return await performInference(messages, controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}
