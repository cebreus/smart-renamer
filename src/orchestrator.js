/**
 * @file Main process for renaming files.
 */
import path from 'node:path'

import { getCachedMetadata } from './cache.js'
import { CONFIG } from './config.js'
import { calculateHash } from './dedupe.js'
import { analyzeDocument } from './llm.js'
import { logger } from './logger.js'
import { cleanupOCRImage, runOCR } from './ocr.js'
import { addRegistryRule, loadRegistry, matchRegistry } from './registry.js'
import { assembleFilename, getMtimeDate, performRename } from './rename.js'
import {
  closePreview,
  openPreview,
  sanitizeUserInput,
  showInputDialog,
} from './ui.js'
import { extractDateFallback } from './utilities.js'

function normalizeValue(value) {
  if (!value || value === 'null') return undefined
  return String(value).trim()
}

function learnNewRule(userInput, text, title) {
  if (!userInput || !text) return

  const cleanText = text.toLowerCase()
  const cleanInput = userInput.toLowerCase()

  if (cleanInput.length >= 2 && cleanText.includes(cleanInput)) {
    addRegistryRule({ pattern: userInput, company: userInput, title })
    return
  }

  const words = userInput.split(/\s+/).filter((w) => w.length >= 2)
  for (const word of words) {
    if (cleanText.includes(word.toLowerCase())) {
      addRegistryRule({ pattern: word, company: userInput, title })
      return
    }
  }
}

async function getSuggestion(text, imagePath, originalNameOnly) {
  let aiResult = {}
  try {
    if (text.length >= CONFIG.OCR_MIN_CHARS) {
      logger.status(2, 'Analýza dokumentu (AI)...')
      aiResult = await analyzeDocument({
        text,
        imagePath,
        originalName: originalNameOnly,
      })
    }
  } catch (error) {
    logger.warn(`AI analýza selhala: ${error.message}`)
  }

  return {
    company: normalizeValue(aiResult?.company),
    title: normalizeValue(aiResult?.title),
    date: normalizeValue(aiResult?.date),
    hasAiError: Boolean(!aiResult || aiResult.error),
  }
}

function finalize(absPath, hash, components, extension) {
  const newFilename = assembleFilename({ ...components, extension })
  const isDry = CONFIG.DRY_RUN

  if (newFilename === path.basename(absPath)) {
    logger.status(3, 'Název je již optimální.')
    logger.transaction({
      status: 'skipped_no_change',
      original_abs: absPath,
      hash,
      ...components,
    })
    return
  }

  try {
    const finalPath = isDry ? newFilename : performRename(absPath, newFilename)
    const prefix = isDry ? '\u001B[35m[ZKUŠEBNÍ REŽIM]\u001B[0m ' : ''
    logger.status(3, `${prefix}Přejmenováno na: ${path.basename(finalPath)}`)
    logger.transaction({
      status: isDry ? 'dry_run' : 'ok',
      original_abs: absPath,
      hash,
      ...components,
    })
  } catch (error) {
    logger.error(`Přejmenování selhalo: ${error.message}`)
    logger.transaction({
      status: 'failed',
      original_abs: absPath,
      hash,
      error: error.message,
    })
    throw error
  }
}

function handleManualInput(absPath, suggestion, originalNameOnly) {
  logger.status(3, 'Vyžadována verifikace...')
  const fileName = path.basename(absPath)
  openPreview(absPath)
  const defaultValue = suggestion || originalNameOnly
  const userInput = showInputDialog(`Firma pro: ${fileName}`, defaultValue)
  closePreview(fileName)

  if (userInput === undefined) {
    throw new Error('Operace zrušena (Escape)')
  }

  const sanitized = sanitizeUserInput(userInput)
  logger.debug(`Zadána firma: "${sanitized}"`)
  return sanitized
}

function resolveFinalComponents({ userInput, suggestion, text, absPath }) {
  return {
    company: userInput,
    title: suggestion.title,
    date: suggestion.date || extractDateFallback(text) || getMtimeDate(absPath),
    method: 'manual',
  }
}

async function runInteraction({
  text,
  imagePath,
  originalNameOnly,
  absPath,
  hash,
  extension,
}) {
  const suggestion = await getSuggestion(text, imagePath, originalNameOnly)
  cleanupOCRImage(imagePath)

  const userInput = handleManualInput(
    absPath,
    suggestion.company,
    originalNameOnly
  )
  const finalComponents = resolveFinalComponents({
    userInput,
    suggestion,
    text,
    absPath,
  })

  learnNewRule(finalComponents.company, text, finalComponents.title)
  finalize(absPath, hash, finalComponents, extension)
}

function handleRegistryMatch({
  text,
  registry,
  imagePath,
  absPath,
  hash,
  extension,
}) {
  const match = matchRegistry(text, registry)

  if (match.company) {
    logger.warn(`Shoda v registru [${match.company}].`)
    cleanupOCRImage(imagePath)
    const date = extractDateFallback(text) || getMtimeDate(absPath)
    finalize(absPath, hash, { ...match, method: 'registry', date }, extension)
    return true
  }
  return false
}

async function handleCacheAndRegistry({
  absPath,
  hash,
  extension,
  registry,
  cached,
}) {
  if (cached?.company && registry.some((r) => r.company === cached.company)) {
    logger.warn(`Nalezeno v historii [${cached.company}].`)
    finalize(absPath, hash, { ...cached, method: 'cache' }, extension)
    return true
  }

  const { text, imagePath } = await runOCR(absPath)
  if (
    handleRegistryMatch({ text, registry, imagePath, absPath, hash, extension })
  ) {
    return true
  }

  if (cached?.company) {
    logger.warn(
      `Nalezeno v historii [${cached.company}]. Vytvářím trvalé pravidlo...`
    )
    learnNewRule(cached.company, text, cached.title)
    cleanupOCRImage(imagePath)
    finalize(absPath, hash, { ...cached, method: 'cache' }, extension)
    return true
  }

  return { text, imagePath }
}

async function runPipeline({ absPath, extension, originalNameOnly, hash }) {
  const cached = getCachedMetadata(hash)
  const registry = loadRegistry()

  const result = await handleCacheAndRegistry({
    absPath,
    hash,
    extension,
    registry,
    cached,
  })
  if (result === true) return

  const { text, imagePath } = result
  await runInteraction({
    text,
    imagePath,
    originalNameOnly,
    absPath,
    hash,
    extension,
  })
}

/**
 * Processes one file.
 * @param {string} filePath - Path to file to process.
 * @returns {Promise<void>}
 */
export async function processFile(filePath) {
  const absPath = path.resolve(filePath)
  const extension = path.extname(absPath)
  const originalNameOnly = path.basename(absPath, extension)
  const hash = await calculateHash(absPath)

  logger.debug(`Zpracování: ${path.basename(absPath)} [${hash.slice(0, 8)}]`)
  try {
    await runPipeline({ absPath, extension, originalNameOnly, hash })
  } catch (error) {
    if (error.message.includes('AI')) {
      throw error
    }
    logger.error(`Chyba: ${error.message}`)
    throw error
  }
}
