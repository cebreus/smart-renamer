/**
 * @file Higher-level pipeline orchestration steps.
 */

import path from 'node:path'

import { saveToCache } from './cache.js'
import { CONFIG } from './config.js'
import { logger } from './logger.js'
import { addRegistryRule } from './registry.js'
import { assembleFilename, getMtimeDate, performRename } from './rename.js'
import { ensureObject, ensureString } from './utilities.js'

/**
 * Learns a new registry rule from manual input.
 * @param {string} userInput - Manual company name.
 * @param {string} text - OCR text.
 * @param {string} title - Document title.
 * @param {string} [registryPath] - Optional custom registry path.
 * @returns {void}
 */
export function learnNewRule(userInput, text, title, registryPath) {
  ensureString(userInput, 'userInput')
  ensureString(text, 'text')
  ensureString(title, 'title')
  if (registryPath !== undefined && registryPath !== null) {
    ensureString(registryPath, 'registryPath')
  }
  if (!userInput || !text || userInput.length < 3) return
  const words = [...new Set(userInput.split(/\s+/))].filter(
    (word) => word.length >= 4
  )
  const lowerText = text.toLowerCase()
  const matchedWords = words.filter((word) =>
    lowerText.includes(word.toLowerCase())
  )

  if (matchedWords.length >= 2) {
    const pattern = matchedWords.slice(0, 2).join(' ').toLowerCase()
    addRegistryRule({ pattern, company: userInput, title }, registryPath)
  }
}

/**
 * Finalises file renaming.
 * @param {string} absPath - File path.
 * @param {string} hash - File hash.
 * @param {object} components - Filename parts.
 * @param {object} [options] - Options.
 * @param {string} [options.extension] - File extension.
 * @param {boolean} [options.dryRun] - Whether to run in dry mode.
 * @returns {void}
 */
export function finalize(absPath, hash, components, options = {}) {
  ensureString(absPath, 'absPath')
  ensureString(hash, 'hash')
  ensureObject(components, 'components')
  const { extension } = options
  const newFilename = assembleFilename({ ...components, extension })
  const isDry = options.dryRun ?? CONFIG.DRY_RUN
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

/**
 * High-level pipeline finalisation.
 * @param {string} absPath - File path.
 * @param {string} hash - File hash.
 * @param {import('./discovery.js').DiscoveryResult} merged - Merged results.
 * @param {object} [options] - Options.
 * @param {string} [options.fullText] - OCR text.
 * @param {string} [options.registryPath] - Optional custom registry path.
 * @returns {void}
 */
export function finalizePipeline(absPath, hash, merged, options = {}) {
  ensureString(absPath, 'absPath')
  ensureString(hash, 'hash')
  ensureObject(merged, 'merged')
  const { fullText, registryPath } = options
  const mergedCopy = { ...merged }
  let isMtime = false
  if (!mergedCopy.date) {
    mergedCopy.date = getMtimeDate(absPath)
    isMtime = true
  }

  if (mergedCopy.method === 'manual' && mergedCopy.company) {
    learnNewRule(mergedCopy.company, fullText, mergedCopy.title, registryPath)
  }
  finalize(absPath, hash, { ...mergedCopy, isMtime }, options)
}

/**
 * Handles successful pipeline completion.
 * @param {object} parameters - Success context.
 * @param {string} parameters.absPath - File path.
 * @param {string} parameters.hash - File hash.
 * @param {import('./discovery.js').DiscoveryResult} parameters.final - Final discovery result.
 * @param {object} parameters.options - Execution options.
 * @param {string} parameters.extension - File extension.
 * @param {string} parameters.fullText - OCR text.
 * @returns {Promise<void>}
 */
export async function handlePipelineSuccess(parameters) {
  ensureObject(parameters, 'parameters')
  const { absPath, hash, final, options, extension, fullText } = parameters
  await saveToCache(hash, final, path.basename(absPath))
  finalizePipeline(absPath, hash, final, {
    ...options,
    extension,
    fullText,
  })
}
