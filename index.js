/**
 * @file Main entry point for Smart Renamer.
 */
import { randomUUID } from 'node:crypto'
import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { calculateHash, createDeduplicator } from './src/dedupe.js'
import {
  clearOperationId,
  logger,
  setOperationId,
  setRunId,
} from './src/logger.js'
import { cleanupAllOCRFiles } from './src/ocr.js'
import { processFile } from './src/orchestrator.js'
import { runRollback } from './src/rollback.js'
import { ensureArray } from './src/utilities.js'

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
])
const SHUTDOWN_WAIT_MS = 1500
let shuttingDown = false
let activeFileOperations = 0

function hasActiveWork() {
  return activeFileOperations > 0
}

async function waitForActiveWork(timeoutMs) {
  const start = Date.now()
  while (hasActiveWork() && Date.now() - start < timeoutMs) {
    await delay(50)
  }
}

async function shutdownGracefully(signalName) {
  if (shuttingDown) return
  shuttingDown = true
  logger.warn(`\n--- Shutdown requested (${signalName}) ---`)

  cleanupAllOCRFiles()
  await waitForActiveWork(SHUTDOWN_WAIT_MS)

  // Force exit after cleanup.
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  process.exit(0)
}

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
  ensureArray(paths, 'paths')
  const files = []
  // maxDepth limits how deep recursion goes, and visited tracks paths we already saw so we do not repeat them.
  if (maxDepth < 0) return files

  for (const p of paths) {
    let stats
    try {
      stats = lstatSync(p)
    } catch (error) {
      logger.warn(`Cesta neexistuje: ${p} (${error.message})`)
      continue
    }

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

async function handleFile(file, { deduplicator, force, dryRun }) {
  if (shuttingDown) {
    logger.warn(`Skipping file during shutdown: ${path.basename(file)}`)
    return
  }
  const absPath = path.resolve(file)

  if (deduplicator) {
    const hash = await calculateHash(absPath)
    if (!deduplicator(hash)) {
      logger.info(`[!] Soubor již zpracován (duplikát): ${path.basename(file)}`)
      logger.transaction({ status: 'skipped_duplicate', original_abs: absPath })
      return
    }
  }

  await processFile(absPath, { force, dryRun })
}

async function processFilesLoop(expanded, { deduplicator, force, dryRun }) {
  let hasErrors = false
  for (const file of expanded) {
    if (shuttingDown) break
    setOperationId(randomUUID())
    activeFileOperations += 1
    try {
      await handleFile(file, { deduplicator, force, dryRun })
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : String(error)
      logger.error(`Selhalo zpracování souboru ${file}: ${message}`)
      hasErrors = true
    } finally {
      activeFileOperations = Math.max(0, activeFileOperations - 1)
      clearOperationId()
    }
  }
  return hasErrors
}

async function processFiles(files, options) {
  ensureArray(files, 'files')
  const expanded = expandFiles(files)
  if (expanded.length === 0) {
    logger.warn('Nebyly nalezeny žádné podporované soubory ke zpracování.')
    return false
  }

  const { dedupe, force, dryRun } = options
  const deduplicator = dedupe ? createDeduplicator() : undefined
  const hasErrors = await processFilesLoop(expanded, {
    deduplicator,
    force,
    dryRun,
  })

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

const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  process.on('SIGINT', () => {
    void shutdownGracefully('SIGINT')
  })

  process.on('SIGTERM', () => {
    void shutdownGracefully('SIGTERM')
  })

  setRunId(randomUUID())

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
    logger.info('--- Zahajuji zpracování ---')
    const success = await processFiles(positionals, {
      dedupe: values.dedupe,
      force: values.force,
      dryRun: values.dry,
    })
    if (success) {
      logger.info('--- Hotovo ---')
    } else {
      logger.error('--- Dokončeno s chybami ---')
      process.exitCode = 1
    }
  }
}
