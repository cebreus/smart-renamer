/**
 * @file Deduplication tools for file processing.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Calculates file hash.
 * @param {string} filePath - File path.
 * @returns {Promise<string>} File hash.
 */
export async function calculateHash(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('filePath must be a non-empty string')
  }

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
 */
export function createDeduplicator() {
  const seenHashes = new Set()

  return function isUnique(hash) {
    if (typeof hash !== 'string' || hash.trim() === '') {
      throw new TypeError('hash must be a non-empty string')
    }

    if (seenHashes.has(hash)) {
      return false
    }
    seenHashes.add(hash)
    return true
  }
}
