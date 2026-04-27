import path from 'node:path'

import { CONFIG } from './config.js'
import { analyzeDocument } from './llm.js'
import { logError, logTransaction } from './logger.js'
import { cleanupOCRImage, runOCR } from './ocr.js'
import { loadRegistry, matchRegistry } from './registry.js'
import { assembleFilename, getMtimeDate, performRename } from './rename.js'
import { sanitizeUserInput, showInputDialog } from './ui.js'
import { extractDateFallback, logStatus } from './utilities.js'

/**
 * Orchestrator module that connects all pipeline steps.
 * Cross-referenced with ARCHITECTURE Section 2 and PRD Section 7.1.
 */

/**
 * Performs LLM analysis if text length is sufficient.
 * @param {string} text - OCR text string.
 * @param {string} [imagePath] - Optional path to temp image.
 * @param {string} originalName - Original name without extension.
 * @returns {Promise<object|undefined>} - Analysis result.
 */
async function runLLMAnalysis(text, imagePath, originalName) {
  if (text.length >= CONFIG.OCR_MIN_CHARS) {
    logStatus(2, 'Analýza dokumentu (AI)...')
    return analyzeDocument({ text, imagePath, originalName })
  }
  return undefined
}

/**
 * Extracts metadata using multiple strategies.
 * @param {string} text - OCR text.
 * @param {string} [imagePath] - Path to temp image.
 * @param {string} originalName - Original filename.
 * @returns {Promise<object>} - Extracted metadata.
 */
async function extractMetadata(text, imagePath, originalName) {
  const registry = loadRegistry()
  const registryMatch = matchRegistry(text, registry)
  const llmResult = await runLLMAnalysis(text, imagePath, originalName)

  return {
    company: registryMatch.company ?? llmResult?.company,
    title: registryMatch.title ?? llmResult?.title,
    date: llmResult?.date,
  }
}

/**
 * Resolves the document date using fallbacks.
 * @param {string} text - OCR text.
 * @param {string} absPath - Absolute path to file.
 * @param {string} [initialDate] - Date from LLM.
 * @returns {object} - { date, isMtime }
 */
function resolveDate(text, absPath, initialDate) {
  let date = initialDate
  let isMtime = false

  if (!date) {
    date = extractDateFallback(text)
  }

  if (!date) {
    date = getMtimeDate(absPath)
    isMtime = true
  }

  return { date, isMtime }
}

/**
 * Finalizes the rename operation and logs result.
 * @param {string} absPath - Source path.
 * @param {string} newFilename - Target name.
 * @param {boolean} isMtime - Date fallback flag.
 */
function finalizeRename(absPath, newFilename, isMtime) {
  const currentBasename = path.basename(absPath)
  if (newFilename === currentBasename) {
    logStatus(3, 'Název je již optimální, přeskakuji.')
    logTransaction({ status: 'skipped_no_change', original_abs: absPath })
    return
  }

  try {
    const finalPath = performRename(absPath, newFilename)
    logStatus(3, `Přejmenováno na: ${path.basename(finalPath)}`)
    logTransaction({
      status: 'ok',
      original_abs: absPath,
      renamed_abs: finalPath,
      method: isMtime ? 'mtime_fallback' : 'auto',
    })
  } catch (error) {
    logError(`Rename failed: ${error.message}`)
    logTransaction({
      status: 'rename_failed',
      original_abs: absPath,
      error: error.message,
    })
  }
}

/**
 * Gathers all components for the new filename.
 * @param {object} params - Parameters.
 * @param {string} params.text - OCR text.
 * @param {string} params.absPath - Absolute path.
 * @param {object} params.metadata - Initial metadata.
 * @param {string} params.originalNameOnly - Basename without ext.
 * @returns {object} - Filename components.
 */
function gatherFilenameComponents({
  text,
  absPath,
  metadata,
  originalNameOnly,
}) {
  const { date, isMtime } = resolveDate(text, absPath, metadata.date)
  let { company } = metadata

  if (!company) {
    logStatus(3, 'Vyžadován ruční vstup pro firmu...')
    const userInput = showInputDialog(
      `Firma pro: ${path.basename(absPath)}`,
      originalNameOnly
    )
    company = sanitizeUserInput(userInput)
  }

  return { date, company, title: metadata.title, isMtime }
}

/**
 * Runs the full processing pipeline.
 * @param {string} absPath - Absolute path.
 * @param {string} extension - Extension.
 * @param {string} originalNameOnly - Basename without extension.
 * @returns {Promise<void>}
 */
async function runPipeline(absPath, extension, originalNameOnly) {
  const { text, imagePath } = await runOCR(absPath)
  const metadata = await extractMetadata(text, imagePath, originalNameOnly)
  cleanupOCRImage(imagePath)

  const components = gatherFilenameComponents({
    text,
    absPath,
    metadata,
    originalNameOnly,
  })
  const newFilename = assembleFilename({ ...components, extension })

  finalizeRename(absPath, newFilename, components.isMtime)
}

/**
 * Processes a single file through the entire pipeline.
 * @param {string} filePath - Path to the file to process.
 * @returns {Promise<void>}
 */
export async function processFile(filePath) {
  const absPath = path.resolve(filePath)
  const extension = path.extname(absPath)
  const nameOnly = path.basename(absPath, extension)

  logStatus(1, `Extrakce textu: ${path.basename(absPath)}`)

  try {
    await runPipeline(absPath, extension, nameOnly)
  } catch (error) {
    logError(
      `Processing failed for ${path.basename(absPath)}: ${error.message}`
    )
    logTransaction({
      status: 'failed',
      original_abs: absPath,
      error: error.message,
    })
  }
}
