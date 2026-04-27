import path from 'node:path'
import { parseArgs } from 'node:util'

import { calculateHash, createDeduplicator } from './src/dedupe.js'
import { logError, logInfo, logTransaction } from './src/logger.js'
import { processFile } from './src/orchestrator.js'

/**
 * Main entry point for Smart Renamer CLI.
 * Cross-referenced with PRD Section 5 (FR-01, FR-10).
 */

/**
 * Handles a single file processing with deduplication check.
 * @param {string} file - Path to file string.
 * @param {function(string): boolean} [deduplicator] - Deduplication filter function.
 * @returns {Promise<void>} - Promise.
 */
async function handleFile(file, deduplicator) {
  const absPath = path.resolve(file)

  if (deduplicator) {
    try {
      const hash = await calculateHash(absPath)
      if (!deduplicator(hash)) {
        logInfo(`[!] Soubor již zpracován (duplikát): ${file}`)
        logTransaction({ status: 'skipped_duplicate', original_abs: absPath })
        return
      }
    } catch (error) {
      logError(`Dedupe check failed for ${file}: ${error.message}`)
    }
  }

  try {
    await processFile(absPath)
  } catch (error) {
    logError(`Fatální chyba při zpracování ${file}: ${error.message}`)
  }
}

/**
 * Executes the processing loop for files.
 * @param {string[]} files - List of files array.
 * @param {function(string): boolean} [deduplicator] - Optional deduplicator function.
 * @returns {Promise<void>} - Promise.
 */
async function processFiles(files, deduplicator) {
  for (const file of files) {
    await handleFile(file, deduplicator)
  }
}

const options = {
  dedupe: { type: 'boolean', short: 'd' },
  help: { type: 'boolean', short: 'h' },
}

const { values, positionals } = parseArgs({ options, allowPositionals: true })

if (values.help || positionals.length === 0) {
  logInfo(`
Smart Renamer — Privacy-First macOS File Renaming
Usage: smart-renamer [options] <file1> <file2> ...

Options:
  -d, --dedupe    Skip identical files based on SHA-256 hash
  -h, --help      Show this help message
  `)
} else {
  const deduplicator = values.dedupe ? createDeduplicator() : undefined

  logInfo('--- Smart Renamer: Spouštím zpracování ---')

  await processFiles(positionals, deduplicator)

  logInfo('--- Hotovo ---')
}
