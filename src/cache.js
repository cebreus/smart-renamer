/**
 * @file Cache module for storing saved file metadata.
 *
 * Cache file format (registry-files.json5):
 * Array of objects:
 * {
 *   hash: string,
 *   company: string,
 *   title: string,
 *   date: string (YYYY-MM-DD),
 *   original_names: string[]
 * }
 */

import { existsSync, promises as fsPromises, readFileSync } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'

import { CONFIG } from './config.js'
import { logger } from './logger.js'
import { ensureObject, ensureString } from './utilities.js'

let memoryCache = undefined
let currentCachePath = undefined
const MAX_ORIGINAL_NAMES = 3

function clearInMemoryCache() {
  memoryCache = undefined
  currentCachePath = undefined
}

function normalizeOriginalNames(value) {
  if (!Array.isArray(value)) return []

  return value
    .filter((name) => typeof name === 'string' && name.trim() !== '')
    .slice(-MAX_ORIGINAL_NAMES)
}

function mergeOriginalNames(previous, candidate) {
  const merged = [...normalizeOriginalNames(previous)]
  if (
    typeof candidate === 'string' &&
    candidate.trim() !== '' &&
    !merged.includes(candidate)
  ) {
    merged.push(candidate)
  }
  return merged.slice(-MAX_ORIGINAL_NAMES)
}

function getCachePath() {
  return path.join(path.dirname(CONFIG.LOG_FILE), 'registry-files.json5')
}

function prepareCacheForPath(resolvedPath) {
  if (memoryCache !== undefined && currentCachePath === resolvedPath) {
    return false
  }

  if (memoryCache !== undefined && currentCachePath !== resolvedPath) {
    clearInMemoryCache()
  }

  memoryCache = new Map()
  currentCachePath = resolvedPath
  return true
}

function loadCacheEntries(resolvedPath) {
  const content = readFileSync(resolvedPath, 'utf8')
  const data = JSON5.parse(content)
  if (!Array.isArray(data)) return

  for (const entry of data) {
    let hash
    try {
      hash = ensureString(entry.hash, 'hash')
    } catch {
      logger.warn(`Skipping cache entry with invalid hash: ${entry.hash}`)
      continue
    }
    memoryCache.set(hash, {
      company: entry.company,
      title: entry.title,
      date: entry.date,
      original_names: normalizeOriginalNames(entry.original_names),
    })
  }
}

function initializeCache(filePath = getCachePath()) {
  const resolvedPath = path.resolve(filePath)
  const didPrepare = prepareCacheForPath(resolvedPath)
  if (!didPrepare) return

  if (!existsSync(resolvedPath)) return

  try {
    loadCacheEntries(resolvedPath)
    logger.debug(`Curated memory loaded: ${memoryCache.size} records.`)
  } catch (error) {
    logger.debug(`Error loading memory: ${error.message}`)
  }
}

/**
 * Gets stored metadata from cache.
 * @typedef {object} CacheMetadata
 * @property {string} company - Company name.
 * @property {string} title - Document title.
 * @property {string} date - Document date (YYYY-MM-DD).
 * @property {string[]} original_names - List of recent original filenames.
 * @param {string} hash - File hash.
 * @param {object} [options] - Optional settings.
 * @param {boolean} [options.force] - Force ignore cache.
 * @param {string} [options.cachePath] - Custom cache path.
 * @param {boolean} [options.reset] - Clear memory cache before access.
 * @returns {CacheMetadata|undefined} Stored data.
 */
export function getCachedMetadata(hash, { force, cachePath, reset } = {}) {
  ensureString(hash, 'hash')
  const isForce = force ?? CONFIG.FORCE
  if (reset) clearInMemoryCache()
  if (isForce) return undefined
  initializeCache(cachePath)
  return memoryCache.get(hash)
}

/**
 * Saves approved metadata to curated cache.
 * @param {string} hash - File hash.
 * @param {CacheMetadata} metadata - Metadata to store.
 * @param {string} [originalName] - Original filename before processing.
 * @param {object} [options] - Optional settings.
 * @param {string} [options.cachePath] - Optional custom cache path.
 * @param {boolean} [options.reset] - Clear in-memory cache before loading path.
 * @returns {Promise<void>}
 */
export async function saveToCache(hash, metadata, originalName, options = {}) {
  ensureString(hash, 'hash')
  ensureObject(metadata, 'metadata')
  const { cachePath, reset } = options
  const filePath = cachePath || getCachePath()
  if (reset) clearInMemoryCache()
  initializeCache(filePath)
  const existing = memoryCache.get(hash)
  memoryCache.set(hash, {
    company: metadata.company,
    title: metadata.title,
    date: metadata.date,
    original_names: mergeOriginalNames(existing?.original_names, originalName),
  })

  try {
    const data = [...memoryCache.entries()].map(([h, m]) => ({
      hash: h,
      ...m,
    }))
    await fsPromises.writeFile(
      filePath,
      JSON5.stringify(data, undefined, 2),
      'utf8'
    )
  } catch (error) {
    logger.warn(
      `Error writing to cache at ${filePath}: ${error.message}\nStack: ${error.stack}`
    )
  }
}
