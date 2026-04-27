import path from 'node:path'

import { getCachedMetadata } from './cache.js'
import { CONFIG } from './config.js'
import { calculateHash } from './dedupe.js'
import { analyzeDocument } from './llm.js'
import { logger } from './logger.js'
import { cleanupOCRPages, runOCR } from './ocr.js'
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
  if (!value || value === 'null') {
    return undefined
  }
  return String(value).trim()
}

function learnNewRule(userInput, text, title) {
  if (!userInput || !text) {
    return
  }
  const words = userInput.split(/\s+/).filter((word) => word.length >= 2)
  for (const word of words) {
    if (text.toLowerCase().includes(word.toLowerCase())) {
      addRegistryRule({ pattern: word, company: userInput, title })
      return
    }
  }
}

async function runDiscovery({ pages, originalName, userPrompt }) {
  try {
    logger.status(
      2,
      userPrompt ? 'Upřesňuji analýzu (AI)...' : 'Analýza dokumentu (AI)...'
    )
    const aiResult = await analyzeDocument({ pages, originalName, userPrompt })
    if (aiResult?.vision_check) {
      logger.debug(`Vizuální kontrola: ${aiResult.vision_check}`)
    }
    return {
      company: normalizeValue(aiResult?.company),
      title: normalizeValue(aiResult?.title),
      date: normalizeValue(aiResult?.date),
      method: 'ai',
    }
  } catch (error) {
    logger.error(`AI selhala: ${error.message}`)
    return { method: 'fallback' }
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

async function handleIterativeInput(
  absPath,
  discovery,
  pages,
  originalNameOnly
) {
  let current = discovery
  let userInput
  const fileName = path.basename(absPath)
  openPreview(absPath)

  while (true) {
    const defaultValue =
      current.company ||
      (current.title
        ? `${originalNameOnly} - ${current.title}`
        : originalNameOnly)
    userInput = showInputDialog(
      `Zadejte firmu (nebo /ai <dotaz>): ${fileName}`,
      defaultValue
    )

    if (userInput === undefined) {
      throw new Error('Operace zrušena (Escape)')
    }
    if (!userInput.startsWith('/ai ')) {
      break
    }

    const prompt = userInput.slice(4).trim()
    current = await runDiscovery({
      pages,
      originalName: originalNameOnly,
      userPrompt: prompt,
    })
  }

  closePreview(fileName)
  return { company: sanitizeUserInput(userInput), discovery: current }
}

async function runInteraction(parameters) {
  const { pages, originalNameOnly, absPath, hash, extension } = parameters
  const discovery = await runDiscovery({
    pages,
    originalName: originalNameOnly,
  })
  const { company, discovery: final } = await handleIterativeInput(
    absPath,
    discovery,
    pages,
    originalNameOnly
  )

  const fullText = pages.map((p) => p.text).join('\n')
  const finalComponents = {
    company,
    title: final.title,
    date: final.date || extractDateFallback(fullText) || getMtimeDate(absPath),
    method: 'manual',
  }

  learnNewRule(finalComponents.company, fullText, finalComponents.title)
  finalize(absPath, hash, finalComponents, extension)
}

async function runPipeline({ absPath, extension, originalNameOnly, hash }) {
  const cached = getCachedMetadata(hash)
  const registry = loadRegistry()

  if (cached?.company && registry.some((r) => r.company === cached.company)) {
    logger.warn(`Nalezeno v historii [${cached.company}].`)
    finalize(absPath, hash, { ...cached, method: 'cache' }, extension)
    return
  }

  const { pages } = await runOCR(absPath)
  const fullText = pages.map((p) => p.text).join('\n')
  const match = matchRegistry(fullText, registry)

  if (match.company) {
    logger.warn(`Shoda v registru [${match.company}].`)
    cleanupOCRPages(pages)
    const date = extractDateFallback(fullText) || getMtimeDate(absPath)
    finalize(absPath, hash, { ...match, method: 'registry', date }, extension)
    return
  }

  await runInteraction({ pages, originalNameOnly, absPath, hash, extension })
  cleanupOCRPages(pages)
}

/**
 * Processes a single file through the entire pipeline.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<void>}
 */
export async function processFile(filePath) {
  const absPath = path.resolve(filePath)
  const hash = await calculateHash(absPath)
  logger.debug(`Zpracování: ${path.basename(absPath)} [${hash.slice(0, 8)}]`)
  try {
    await runPipeline({
      absPath,
      extension: path.extname(absPath),
      originalNameOnly: path.basename(absPath, path.extname(absPath)),
      hash,
    })
  } catch (error) {
    if (!error.message.includes('AI')) {
      logger.error(`Chyba: ${error.message}`)
    }
    throw error
  }
}
