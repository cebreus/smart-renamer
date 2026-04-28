/**
 * @file Batch rollback logic using transaction logs.
 */
import { existsSync, readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { logger } from './logger.js'
import { performUndo } from './rename.js'

/**
 * Performs rollback of the last successful session.
 * @returns {Promise<void>}
 */
function getTransactions() {
  const lines = readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n')
  return lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    })
    .filter((t) => t?.status === 'ok' && t.original_abs && t.final_abs)
    .toReversed()
}

/**
 * Performs rollback of the last successful session.
 * @returns {Promise<void>}
 */
export async function runRollback() {
  if (!existsSync(CONFIG.LOG_FILE)) {
    logger.error('Logovací soubor nebyl nalezen. Rollback není možný.')
    return
  }

  const transactions = getTransactions()
  if (transactions.length === 0) {
    logger.info('Nebyly nalezeny žádné transakce k vrácení.')
    return
  }

  logger.info(`--- Zahajuji Rollback (${transactions.length} souborů) ---`)

  let count = 0
  for (const t of transactions) {
    try {
      if (existsSync(t.final_abs)) {
        const final = performUndo(t.final_abs, t.original_abs)
        logger.info(`Vráceno: ${t.final_abs} -> ${final}`)
        count += 1
      } else {
        logger.warn(`Přeskakuji (soubor neexistuje): ${t.final_abs}`)
      }
    } catch (error) {
      logger.error(`Rollback selhal pro ${t.final_abs}: ${error.message}`)
    }
  }

  logger.info(
    `--- Rollback dokončen (${count}/${transactions.length} úspěšně) ---`
  )
}
