/**
 * @file Batch rollback logic using transaction logs.
 */

import { existsSync, promises as fsPromises, readFileSync } from 'node:fs'
import path from 'node:path'

import { CONFIG } from './config.js'
import { calculateHash } from './dedupe.js'
import { logger } from './logger.js'
import { performUndo } from './rename.js'
import { ensureObject, ensureString } from './utilities.js'

async function checkEntry(entry, targetHash, searchDirectory, maxDepth) {
  const fullPath = path.join(searchDirectory, entry.name)
  if (entry.isDirectory()) {
    // eslint-disable-next-line no-use-before-define
    return findFileByHash(targetHash, fullPath, maxDepth - 1)
  }
  if (entry.isFile()) {
    const hash = await calculateHash(fullPath).catch(() => undefined)

    if (hash && targetHash && hash === targetHash) return fullPath
  }
  return undefined
}

async function findFileByHash(targetHash, searchDirectory, maxDepth = 5) {
  if (!targetHash || !existsSync(searchDirectory) || maxDepth < 0)
    return undefined

  try {
    const entries = await fsPromises.readdir(searchDirectory, {
      withFileTypes: true,
    })
    for (const entry of entries) {
      const found = await checkEntry(
        entry,
        targetHash,
        searchDirectory,
        maxDepth
      )
      if (found) return found
    }
  } catch {
    // Skip directories that cannot be read
  }
  return undefined
}

/**
 * Parses a single log file into JSON objects.
 * @param {string} filePath - Path to log file.
 * @returns {Array<object>} Array of parsed entries.
 */
export function parseLogFile(filePath) {
  ensureString(filePath, 'filePath')
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return undefined
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function getTransactions() {
  const logs = [CONFIG.LOG_FILE]
  // Add rotated logs if they exist (renames.log.1, renames.log.2, etc.)
  for (let index = 1; index <= (CONFIG.MAX_LOG_FILES || 5); index += 1) {
    const rotatedPath = `${CONFIG.LOG_FILE}.${index}`
    if (existsSync(rotatedPath)) logs.push(rotatedPath)
  }

  const allEntries = logs.flatMap((l) => parseLogFile(l))

  // Find hashes that have already been rolled back
  const rolledBackHashes = new Set(
    allEntries.filter((t) => t.status === 'rolled_back').map((t) => t.hash)
  )

  const valid = allEntries.filter(
    (t) =>
      t.status === 'ok' &&
      t.original_abs &&
      t.final_abs &&
      t.hash &&
      !rolledBackHashes.has(t.hash)
  )

  if (valid.length === 0) return []

  // Get only the last session (run_id)
  const lastRunId = valid.at(-1).run_id
  // Deduplicate by hash within the session to handle edge cases
  const seenHashes = new Set()
  return valid
    .filter((t) => t.run_id === lastRunId)
    .toReversed()
    .filter((t) => {
      if (seenHashes.has(t.hash)) return false
      seenHashes.add(t.hash)
      return true
    })
}

async function resolveRollbackPath(transaction) {
  let currentPath = transaction.final_abs
  if (existsSync(currentPath)) return currentPath

  logger.warn(`Soubor nenalezen na ${currentPath}. Hledám podle obsahu...`)
  const searchPaths = [
    path.dirname(transaction.original_abs),
    path.dirname(transaction.final_abs),
  ]

  for (const searchBase of searchPaths) {
    currentPath = await findFileByHash(transaction.hash, searchBase)
    if (currentPath) return currentPath
  }

  return undefined
}

function logUndoFailure(transaction, currentPath, reason) {
  logger.error(`Vrácení selhalo pro ${currentPath}: ${reason}`)
  logger.transaction({
    status: 'undo_failed',
    original_abs: transaction.original_abs,
    hash: transaction.hash,
    run_id: transaction.run_id,
    reason,
  })
}

function performUndoSafely(transaction, currentPath) {
  try {
    const finalPath = performUndo(currentPath, transaction.original_abs)
    if (!finalPath) {
      logUndoFailure(
        transaction,
        currentPath,
        'performUndo returned empty result'
      )
      return undefined
    }
    return finalPath
  } catch (error) {
    logUndoFailure(transaction, currentPath, error?.message || String(error))
    return undefined
  }
}

function logRollbackSuccess(transaction, currentPath, finalPath) {
  logger.info(`Vráceno: ${path.basename(currentPath)} -> ${finalPath}`)
  logger.transaction({
    status: 'rolled_back',
    original_abs: transaction.original_abs,
    hash: transaction.hash,
    run_id: transaction.run_id,
    reason: 'undo_command',
  })
}

function logRollbackNotFound(hashLabel) {
  logger.error(`Rollback selhal: Soubor ${hashLabel}... nebyl nalezen.`)
}

async function rollbackTransaction(transaction) {
  ensureObject(transaction, 'transaction')
  const currentPath = await resolveRollbackPath(transaction)
  const hashLabel = transaction.hash?.slice(0, 8) || 'unknown'

  if (!currentPath || !existsSync(currentPath)) {
    logRollbackNotFound(hashLabel)
    return false
  }

  const finalPath = performUndoSafely(transaction, currentPath)
  if (!finalPath) return false

  logRollbackSuccess(transaction, currentPath, finalPath)
  return true
}

/**
 * Performs rollback of the last successful session.
 * @returns {Promise<void>}
 */
export async function runRollback() {
  const transactions = getTransactions()
  if (transactions.length === 0) {
    logger.info('Nebyly nalezeny žádné transakce k vrácení.')
    return
  }

  const sessionId = transactions[0].run_id || 'unknown'
  logger.info(
    `--- Zahajuji Rollback sezení ${sessionId} (${transactions.length} souborů) ---`
  )

  let successCount = 0
  for (const transaction of transactions) {
    const isSuccess = await rollbackTransaction(transaction).catch((error) => {
      logger.error(`Chyba: ${error.message}`)
      return false
    })
    if (isSuccess) successCount += 1
  }

  logger.info(
    `--- Rollback dokončen (${successCount}/${transactions.length} úspěšně) ---`
  )
}
