/**
 * @file Cache module for storing file data.
 */
import { existsSync, readFileSync } from 'node:fs'

import { CONFIG } from './config.js'
import { logger } from './logger.js'

let memoryCache = undefined

function processLogLine(line, cache) {
  try {
    const entry = JSON.parse(line)
    const isValid = entry.hash && entry.company && entry.status !== 'failed'
    if (isValid) {
      cache.set(entry.hash, {
        company: entry.company,
        title: entry.title,
        date: entry.date,
      })
    }
  } catch {
    void 0
  }
}

function initializeCache() {
  if (memoryCache !== undefined) return

  memoryCache = new Map()
  if (!existsSync(CONFIG.LOG_FILE)) return

  try {
    const lines = readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n')
    for (const line of lines) {
      processLogLine(line, memoryCache)
    }
    logger.debug(`Paměť načtena: ${memoryCache.size} záznamů.`)
  } catch (error) {
    logger.debug(`Chyba při načítání paměti: ${error.message}`)
  }
}

/**
 * Gets stored metadata from cache.
 * @param {string} hash - File hash.
 * @returns {object|undefined} Stored data.
 */
export function getCachedMetadata(hash) {
  if (CONFIG.FORCE) return undefined

  initializeCache()
  return memoryCache.get(hash)
}
