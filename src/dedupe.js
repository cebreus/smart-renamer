/**
 * @file Deduplication tools for file processing.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

import { ensureString } from './utilities.js'

/**
 * Calculates file hash.
 * @param {string} filePath - File path.
 * @returns {Promise<string>} File hash.
 */
export async function calculateHash(filePath) {
  ensureString(filePath, 'filePath')

  const hash = createHash('sha256')
  const stream = createReadStream(filePath)

  try {
    for await (const chunk of stream) {
      hash.update(chunk)
    }
    return hash.digest('hex')
  } catch (error) {
    throw new Error(`Failed to calculate hash for ${filePath}`, {
      cause: error,
    })
  }
}

/**
 * Creates deduplication function for history check.
 * @returns {function(string): boolean} Function returning true if hash is new.
 * @throws {TypeError} Returned isUnique throws when hash is not a non-empty string.
 */
export function createDeduplicator() {
  const seenHashes = new Set()

  return function isUnique(hash) {
    ensureString(hash, 'hash')

    if (seenHashes.has(hash)) {
      return false
    }
    seenHashes.add(hash)
    return true
  }
}
