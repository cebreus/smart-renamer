import path from 'node:path'

import { getCachedMetadata } from './cache.js'
import { CONFIG } from './config.js'
import { calculateHash } from './dedupe.js'
import {
  clearDiscoverySession,
  createDiscoverySession,
  getDiscovery,
  mergeResults,
  runDiscovery,
} from './discovery.js'
import { handleIterativeInput } from './interaction.js'
import { logger } from './logger.js'
import { cleanupOCRPages, runOCR } from './ocr.js'
import { addRegistryRule, loadRegistry, matchRegistry } from './registry.js'
import {
  assembleFilename,
  getMtimeDate,
  parseProposedName,
  performRename,
} from './rename.js'

function learnNewRule(userInput, text, title) {
  if (!userInput || !text || userInput.length < 3) return
  const words = userInput.split(/\s+/).filter((word) => word.length >= 3)
  for (const word of words) {
    if (text.toLowerCase().includes(word.toLowerCase())) {
      addRegistryRule({ pattern: word, company: userInput, title })
      return
    }
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
      final_abs: absPath,
      hash,
      ...components,
    })
    return
  }
  try {
    const finalPath = isDry
      ? path.join(path.dirname(absPath), newFilename)
      : performRename(absPath, newFilename)
    const prefix = isDry ? '\u001B[35m[ZKUŠEBNÍ REŽIM]\u001B[0m ' : ''
    logger.status(3, `${prefix}Přejmenováno na: ${path.basename(finalPath)}`)
    logger.transaction({
      status: isDry ? 'dry_run' : 'ok',
      original_abs: absPath,
      final_abs: finalPath,
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

async function handleManualFallback({
  absPath,
  merged,
  pages,
  originalNameOnly,
  aiSession,
}) {
  const { company, discovery: final } = await handleIterativeInput({
    absPath,
    aiSession,
    discovery: merged,
    pages,
    originalNameOnly,
    runDiscovery,
  })
  return {
    ...merged,
    company,
    title: final.title,
    date: final.date,
    method: 'manual',
  }
}

function finalizePipeline(
  absPath,
  hash,
  merged,
  { extension, fullText, pages }
) {
  const mergedCopy = { ...merged }
  let isMtime = false
  if (!mergedCopy.date) {
    mergedCopy.date = getMtimeDate(absPath)
    isMtime = true
  }

  cleanupOCRPages(pages)
  if (mergedCopy.method === 'manual' && mergedCopy.company) {
    learnNewRule(mergedCopy.company, fullText, mergedCopy.title)
  }
  finalize(absPath, hash, { ...mergedCopy, isMtime }, extension)
}

async function analyzeContent({
  aiSession,
  absPath,
  originalNameOnly,
  registry,
  cached,
  hint,
}) {
  const { pages } = await runOCR(absPath)
  const fullText = pages.map((p) => p.text).join('\n')
  const registryMatch = matchRegistry(fullText, registry)

  if (registryMatch.company) {
    logger.warn(`Shoda v registru [${registryMatch.company}].`)
  }

  const discovery = await getDiscovery(pages, originalNameOnly, aiSession)
  const merged = mergeResults({
    registryMatch,
    discovery,
    cached,
    fullText,
    hint,
  })

  return { pages, fullText, merged }
}

async function runPipeline({ absPath, extension, originalNameOnly, hash }) {
  let aiSession

  try {
    aiSession = createDiscoverySession()
    const registry = loadRegistry()
    const cached = getCachedMetadata(hash)
    const hint = parseProposedName(originalNameOnly)

    if (
      cached?.company &&
      registry.some((entry) => entry.company === cached.company) &&
      !CONFIG.FORCE
    ) {
      logger.warn(`Nalezeno v historii [${cached.company}].`)
      finalize(absPath, hash, { ...cached, method: 'cache' }, extension)
      return
    }

    const { pages, fullText, merged } = await analyzeContent({
      aiSession,
      absPath,
      originalNameOnly,
      registry,
      cached,
      hint,
    })

    const final = await handleManualFallback({
      absPath,
      merged,
      pages,
      originalNameOnly,
      aiSession,
    })

    finalizePipeline(absPath, hash, final, { extension, fullText, pages })
  } finally {
    clearDiscoverySession(aiSession)
  }
}

/**
 * Processes a single file through the entire pipeline.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<void>}
 */
export async function processFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('filePath must be a non-empty string')
  }
  const absPath = path.resolve(filePath)
  const hash = await calculateHash(absPath)
  logger.separator()
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
