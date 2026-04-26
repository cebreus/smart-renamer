import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Calculates SHA-256 hash of a file using streams for memory efficiency.
 * Cross-referenced with PRD FR-10.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} - Hexadecimal SHA-256 hash.
 */
export async function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(new Error(`Failed to calculate hash for ${filePath}`, { cause: error }));
    });
  });
}

/**
 * Creates a deduplication filter.
 * @returns {Function} - Returns true if hash is unique, false if seen before.
 */
export function createDeduplicator() {
  const seenHashes = new Set();

  /**
   * @param {string} hash - SHA-256 hash to check.
   * @returns {boolean}
   */
  return function isUnique(hash) {
    if (seenHashes.has(hash)) {
      return false;
    }
    seenHashes.add(hash);
    return true;
  };
}
