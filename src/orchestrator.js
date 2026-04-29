/**
 * @file Orchestrator for the main renaming pipeline.
 */

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
import { finalize, handlePipelineSuccess } from './pipeline-steps.js'
import { loadRegistry, matchRegistry } from './registry.js'
import { parseProposedName } from './rename.js'
import { ensureString } from './utilities.js'

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

async function analyzeContent({
  aiSession,
  absPath,
  originalNameOnly,
  registry,
  cached,
  hint,
  minChars,
}) {
  const { pages } = await runOCR(absPath)
  const fullText = pages.map((p) => p.text || '').join('\n')
  const registryMatch = matchRegistry(fullText, registry)

  if (registryMatch.company) {
    logger.warn(`Shoda v registru [${registryMatch.company}].`)
  }

  const discovery = await getDiscovery(
    pages,
    originalNameOnly,
    aiSession,
    minChars
  )
  const merged = mergeResults({
    registryMatch,
    discovery,
    cached,
    fullText,
    hint,
  })

  return { pages, fullText, merged }
}

function getPipelineContext(originalNameOnly, hash, force) {
  const registry = loadRegistry()
  const cached = getCachedMetadata(hash, { force })
  const hint = parseProposedName(originalNameOnly)
  return { registry, cached, hint }
}

function handleCacheHit({
  absPath,
  hash,
  extension,
  cached,
  registry,
  options,
  force,
}) {
  if (
    cached?.company &&
    registry.some((entry) => entry.company === cached.company) &&
    !force
  ) {
    logger.warn(`Nalezeno v historii [${cached.company}].`)
    finalize(
      absPath,
      hash,
      { ...cached, method: 'cache' },
      { ...options, extension }
    )
    return true
  }
  return false
}

async function processPipelineContent({
  aiSession,
  absPath,
  originalNameOnly,
  registry,
  cached,
  hint,
  options,
  extension,
  hash,
}) {
  const { pages, fullText, merged } = await analyzeContent({
    aiSession,
    absPath,
    originalNameOnly,
    registry,
    cached,
    hint,
    minChars: options.minChars,
  })
  const final = await handleManualFallback({
    absPath,
    merged,
    pages,
    originalNameOnly,
    aiSession,
  })
  try {
    cleanupOCRPages(pages)
  } catch (error) {
    logger.debug(
      `cleanupOCRPages selhalo pro stránky: ${error?.message || String(error)}`
    )
  }
  await handlePipelineSuccess({
    absPath,
    hash,
    final,
    options,
    extension,
    fullText,
    pages,
  })
}

async function runPipeline({
  absPath,
  extension,
  originalNameOnly,
  hash,
  options = {},
}) {
  let aiSession
  try {
    aiSession = createDiscoverySession()
    const force = options.force ?? CONFIG.FORCE
    const { registry, cached, hint } = getPipelineContext(
      originalNameOnly,
      hash,
      force
    )
    if (
      handleCacheHit({
        absPath,
        hash,
        extension,
        cached,
        registry,
        options,
        force,
      })
    ) {
      return
    }
    await processPipelineContent({
      aiSession,
      absPath,
      originalNameOnly,
      registry,
      cached,
      hint,
      options,
      extension,
      hash,
    })
  } finally {
    clearDiscoverySession(aiSession)
  }
}

/**
 * Processes a single file through the entire pipeline.
 * @param {string} filePath - Path to the file.
 * @param {object} [options] - Execution options.
 * @param {boolean} [options.force] - Force reprocessing.
 * @param {boolean} [options.dryRun] - Run in dry mode.
 * @param {number} [options.minChars] - Minimum characters for AI analysis.
 * @returns {Promise<void>}
 */
export async function processFile(filePath, options = {}) {
  ensureString(filePath, 'filePath')
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
      options,
    })
  } catch (error) {
    const message = error?.message
    if (typeof message !== 'string' || !message.includes('AI')) {
      logger.error(`Chyba: ${message || String(error)}`)
    }
    throw error
  }
}
