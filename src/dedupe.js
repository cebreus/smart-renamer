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
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })

    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })

    stream.on('error', (error) => {
      reject(
        new Error(`Failed to calculate hash for ${filePath}`, { cause: error })
      )
    })
  })
}

/**
 * Creates deduplication function for history check.
 * @returns {function(string): boolean} Function returning true if hash is new.
 */
export function createDeduplicator() {
  const seenHashes = new Set()

  return function isUnique(hash) {
    if (seenHashes.has(hash)) {
      return false
    }
    seenHashes.add(hash)
    return true
  }
}
