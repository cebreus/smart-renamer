import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SWIFT_SCRIPT = path.join(__dirname, '..', 'bin', 'vision-ocr.swift')

/**
 * OCR module - Page-by-Page Processing.
 */

function handleOCRError(stdout, stderr, status) {
  let errorMessage
  try {
    const result = JSON.parse(stdout)
    errorMessage = result.error
  } catch {
    /* Fail silently */
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }
  throw new Error(`OCR module failed with status ${status}: ${stderr}`)
}

/**
 * Runs the Swift OCR module on a file.
 * @param {string} filePath - Absolute path to file.
 * @returns {Promise<object>} - { pages: [{ text, imagePath }] }
 */
export async function runOCR(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const swiftPath = '/usr/bin/swift'
  const process = spawnSync(swiftPath, [SWIFT_SCRIPT, filePath], {
    encoding: 'utf8',
  })

  if (process.status !== 0 || process.error) {
    handleOCRError(process.stdout, process.stderr, process.status)
  }

  try {
    return JSON.parse(process.stdout)
  } catch (error) {
    throw new Error(`Failed to parse OCR output: ${error.message}`, {
      cause: error,
    })
  }
}

/**
 * Cleans up temporary page images.
 * @param {object[]} pages - Array of page objects.
 */
export function cleanupOCRPages(pages) {
  if (!pages || !Array.isArray(pages)) {
    return
  }
  for (const page of pages) {
    if (page.imagePath && existsSync(page.imagePath)) {
      try {
        unlinkSync(page.imagePath)
      } catch {
        /* Ignore */
      }
    }
  }
}
