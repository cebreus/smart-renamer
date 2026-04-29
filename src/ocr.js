/**
 * @file OCR module using native macOS Vision framework.
 */

import { execFile } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { logger } from './logger.js'
import { ensureArray, ensureFileExists, ensureString } from './utilities.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SWIFT_SCRIPT = path.join(__dirname, '..', 'bin', 'vision-ocr.swift')
const execFileAsync = promisify(execFile)
const activeTemporaryFiles = new Set()

function handleOCRError(stdout, stderr, status) {
  let errorMessage
  try {
    const result = JSON.parse(stdout)
    errorMessage = result.error
  } catch {
    /* Fail quietly */
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }
  throw new Error(`OCR module failed with status ${status}: ${stderr}`)
}

async function resolveSwiftPath() {
  const fromEnvironment = process.env.SWIFT_PATH?.trim()
  if (fromEnvironment) return fromEnvironment

  try {
    const { stdout } = await execFileAsync('which', ['swift'], {
      encoding: 'utf8',
    })
    const resolved = stdout.trim()
    if (resolved) return resolved
  } catch {
    // Fall back to PATH lookup by command name.
  }

  return 'swift'
}

async function executeSwiftOCR(swiftPath, filePath) {
  const OCR_TIMEOUT_MS = 60_000
  try {
    const childResult = await execFileAsync(
      swiftPath,
      [SWIFT_SCRIPT, filePath],
      {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: OCR_TIMEOUT_MS,
      }
    )
    return childResult?.stdout || ''
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error.stderr === 'string' ? error.stderr : ''
    const status = Number.isInteger(error.code) ? error.code : undefined

    if (error.code === 'ENOENT') {
      logger.debug(`Swift executable not found: ${swiftPath}`)
    }
    handleOCRError(stdout, stderr, status)
    // handleOCRError always throws; this return is unreachable but satisfies eslint
    return ''
  }
}

function registerTemporaryPages(pages) {
  if (!pages) return
  for (const page of pages) {
    if (page.imagePath) activeTemporaryFiles.add(page.imagePath)
  }
}

/**
 * Runs the Swift OCR module on a file.
 * @param {string} filePath - Absolute path to file.
 * @returns {Promise<object>} Promise resolving to OCR result object with structure:
 *   { pages: Array<{text: string, bbox?: Array, blocks?: Array, lines?: Array, words?: Array, confidence?: number}> }
 *   Each page contains extracted text and optional bounding box, structural blocks, lines, words, and confidence metadata.
 */
export async function runOCR(filePath) {
  ensureString(filePath, 'filePath')
  ensureFileExists(filePath)

  const swiftPath = await resolveSwiftPath()
  const stdout = await executeSwiftOCR(swiftPath, filePath)

  try {
    const result = JSON.parse(stdout)
    registerTemporaryPages(result.pages)
    return result
  } catch (error) {
    throw new Error(`Failed to parse OCR output: ${error.message}`, {
      cause: error,
    })
  }
}

/**
 * Cleans up temporary page images.
 * @param {object[]} pages - Array of page objects with imagePath.
 */
export function cleanupOCRPages(pages) {
  ensureArray(pages, 'pages')

  for (const page of pages) {
    const { imagePath } = page
    if (!imagePath) continue

    if (existsSync(imagePath)) {
      try {
        unlinkSync(imagePath)
      } catch {
        /* Ignore */
      }
    }
    activeTemporaryFiles.delete(imagePath)
  }
}

/**
 * Deletes temporary files tracked in activeTemporaryFiles.
 * runOCR can add files at the same time.
 * Wait for runOCR to finish if you need a stronger guarantee.
 * @returns {void}
 */
export function cleanupAllOCRFiles() {
  const snapshot = [...activeTemporaryFiles]
  for (const filePath of snapshot) {
    if (!existsSync(filePath)) continue
    try {
      unlinkSync(filePath)
    } catch {
      /* Ignore */
    }
  }
  for (const filePath of snapshot) {
    activeTemporaryFiles.delete(filePath)
  }
}
