/**
 * @file Main entry point for Smart Renamer.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'

import { calculateHash, createDeduplicator } from './src/dedupe.js'
import { logger } from './src/logger.js'
import { processFile } from './src/orchestrator.js'

async function handleFile(file, deduplicator) {
  const absPath = path.resolve(file)

  if (deduplicator) {
    const hash = await calculateHash(absPath)
    if (!deduplicator(hash)) {
      logger.info(`[!] Soubor již zpracován (duplikát): ${file}`)
      logger.transaction({ status: 'skipped_duplicate', original_abs: absPath })
      return
    }
  }

  await processFile(absPath)
}

async function processFiles(files) {
  const options = {
    dedupe: { type: 'boolean', short: 'd' },
    force: { type: 'boolean', short: 'f' },
    help: { type: 'boolean', short: 'h' },
  }
  const { values } = parseArgs({ options, allowPositionals: true })

  if (values.force) {
    process.env.FORCE = 'true'
  }

  const deduplicator = values.dedupe ? createDeduplicator() : undefined

  let hasErrors = false
  for (const file of files) {
    try {
      await handleFile(file, deduplicator)
    } catch {
      hasErrors = true
    }
  }
  return !hasErrors
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
})

if (values.help || positionals.length === 0) {
  logger.info(`
Chytré přejmenování souborů (macOS)
Použití: smart-renamer [volby] <soubor1> <soubor2> ...

Volby:
  -d, --dedupe    Přeskočit identické soubory (podle SHA-256 hashe)
  -f, --force     Ignorovat historii a vynutit nové zpracování
  -h, --help      Zobrazit tuto nápovědu
  `)
} else {
  logger.info('--- Zahajuji zpracování ---')

  const success = await processFiles(positionals)

  if (success) {
    logger.info('--- Hotovo ---')
  } else {
    logger.error('--- Dokončeno s chybami ---')
    process.exitCode = 1
  }
}
