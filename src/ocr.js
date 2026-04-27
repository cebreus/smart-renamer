/**
 * @file Native macOS OCR module.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const SWIFT_SCRIPT = path.join(__dirname, 'bin', 'vision-ocr.swift')

function handleOCRError(stdout, stderr, status) {
  let errorMessage
  try {
    const result = JSON.parse(stdout)
    errorMessage = result.error
  } catch {
    void 0
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }
  throw new Error(`OCR module failed with status ${status}: ${stderr}`)
}

function parseOCROutput(stdout, stderr, status) {
  if (status !== 0) {
    handleOCRError(stdout, stderr, status)
  }

  try {
    const result = JSON.parse(stdout)
    if (result.error) throw new Error(result.error)
    return {
      text: result.text || '',
      imagePath: result.imagePath || undefined,
    }
  } catch (error) {
    throw new Error('Failed to parse OCR result', { cause: error })
  }
}

/**
 * Runs OCR on given file.
 * @param {string} filePath - Image or PDF path.
 * @returns {Promise<object>} Object with text and optional image path.
 */
export async function runOCR(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const swiftPath = '/usr/bin/swift'
  const actualPath = existsSync(swiftPath) ? swiftPath : 'swift'

  const process = spawnSync(actualPath, [SWIFT_SCRIPT, filePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })

  if (process.error) {
    throw new Error(`Failed to execute OCR module: ${process.error.message}`, {
      cause: process.error,
    })
  }

  return parseOCROutput(process.stdout, process.stderr, process.status)
}

/**
 * Deletes temporary OCR image.
 * @param {string} imagePath - Image path.
 * @returns {void}
 */
export function cleanupOCRImage(imagePath) {
  if (!imagePath) return

  if (imagePath.includes('/T/')) {
    try {
      if (existsSync(imagePath)) {
        unlinkSync(imagePath)
      }
    } catch {
      void 0
    }
  }
}
