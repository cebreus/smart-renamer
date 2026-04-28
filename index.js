/**
 * @file Main entry point for Smart Renamer.
 */
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { CONFIG } from './src/config.js'
import { calculateHash, createDeduplicator } from './src/dedupe.js'
import { logger } from './src/logger.js'
import { processFile } from './src/orchestrator.js'
import { runRollback } from './src/rollback.js'

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
])
function getDirectoryEntriesSafe(path_, visited) {
  let resolved
  try {
    resolved = realpathSync(path_)
  } catch (error) {
    logger.debug(`Přeskakuji složku (${path_}): ${String(error)}`)
    return []
  }

  if (visited.has(resolved)) return []
  try {
    const entries = readdirSync(path_).map((entry) => path.join(path_, entry))
    visited.add(resolved)
    return entries
  } catch (error) {
    logger.debug(`Přeskakuji složku (${path_}): ${String(error)}`)
    return []
  }
}

function expandFiles(paths, maxDepth = 100, visited = new Set()) {
  const files = []
  // maxDepth limits how deep recursion goes, and visited tracks paths we already saw so we do not repeat them.
  if (maxDepth < 0) return files

  for (const p of paths) {
    if (!existsSync(p)) {
      logger.warn(`Cesta neexistuje: ${p}`)
      continue
    }
    const stats = lstatSync(p)

    if (stats.isDirectory()) {
      const entries = getDirectoryEntriesSafe(p, visited)
      files.push(...expandFiles(entries, maxDepth - 1, visited))
      continue
    }

    if (SUPPORTED_EXTENSIONS.has(path.extname(p).toLowerCase())) {
      files.push(path.resolve(p))
    }
  }

  return files
}

async function handleFile(file, deduplicator) {
  const absPath = path.resolve(file)

  if (deduplicator) {
    const hash = await calculateHash(absPath)
    if (!deduplicator(hash)) {
      logger.info(`[!] Soubor již zpracován (duplikát): ${path.basename(file)}`)
      logger.transaction({ status: 'skipped_duplicate', original_abs: absPath })
      return
    }
  }

  await processFile(absPath)
}

async function processFiles(files, { dedupe }) {
  const expanded = expandFiles(files)
  if (expanded.length === 0) {
    logger.warn('Nebyly nalezeny žádné podporované soubory ke zpracování.')
    return false
  }

  const deduplicator = dedupe ? createDeduplicator() : undefined
  let hasErrors = false

  for (const file of expanded) {
    try {
      await handleFile(file, deduplicator)
    } catch (error) {
      logger.error(`Selhalo zpracování souboru ${file}: ${error.message}`)
      hasErrors = true
    }
  }
  return !hasErrors
}

const options = {
  dedupe: { type: 'boolean' },
  force: { type: 'boolean' },
  dry: { type: 'boolean' },
  undo: { type: 'boolean' },
  help: { type: 'boolean' },
}

const { values, positionals } = parseArgs({
  options,
  allowPositionals: true,
  strict: true,
})

if (values.help || (positionals.length === 0 && !values.undo)) {
  logger.info(`
Chytré přejmenování souborů (macOS)
Použití: smart-renamer [volby] <soubor1> <složka1> ...

Volby:
  --dry           Zkušební režim (nepřejmenuje soubor)
  --force         Ignorovat historii a vynutit nové zpracování
  --dedupe        Přeskočit identické soubory (podle SHA-256 hashe)
  --undo          Vrátit poslední změny (Rollback)
  --help          Zobrazit tuto nápovědu
  `)
} else if (values.undo) {
  await runRollback()
} else {
  CONFIG.FORCE = values.force ?? CONFIG.FORCE
  CONFIG.DRY_RUN = values.dry ?? CONFIG.DRY_RUN
  logger.info('--- Zahajuji zpracování ---')
  const success = await processFiles(positionals, { dedupe: values.dedupe })
  if (success) {
    logger.info('--- Hotovo ---')
  } else {
    logger.error('--- Dokončeno s chybami ---')
    process.exitCode = 1
  }
}
