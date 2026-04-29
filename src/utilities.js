/**
 * @file General purpose utility functions and validation helpers.
 */

import { existsSync } from 'node:fs'

const DEFAULT_PIVOT = 50

function isDateRangeValid(day, month) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

function isValidDate(day, month, year) {
  if (!isDateRangeValid(day, month)) return false
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDotsMatch(match, pivot = DEFAULT_PIVOT) {
  const day = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const yearLength = String(match[3]).length
  let year = Number.parseInt(match[3], 10)

  if (year < 100) {
    year += year <= pivot ? 2000 : 1900
  }

  if (isValidDate(day, month, year)) {
    return {
      date: toIsoDate(year, month, day),
      index: match.index,
      source: 'dots',
      yearLength,
    }
  }
  return undefined
}

function extractIsoDates(text) {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  const candidates = []
  let match
  while ((match = iso.exec(text)) !== null) {
    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)

    if (isValidDate(day, month, year)) {
      candidates.push({
        date: toIsoDate(year, month, day),
        index: match.index,
        source: 'iso',
        yearLength: 4,
      })
    }
  }
  return candidates
}

function sourcePriority(source) {
  return source === 'iso' ? 1 : 0
}

function compareCandidates(a, b) {
  const sourceDifference = sourcePriority(b.source) - sourcePriority(a.source)
  if (sourceDifference !== 0) return sourceDifference

  const yearDifference = b.yearLength - a.yearLength
  if (yearDifference !== 0) return yearDifference

  return a.index - b.index
}

/**
 * Extracts date from text using fallback regex.
 * @param {string} text - Input text to search.
 * @param {number} [pivot] - Pivot for 2-digit year conversion.
 * @returns {string|undefined} Found date as YYYY-MM-DD or undefined.
 */
export function extractDateFallback(text, pivot = DEFAULT_PIVOT) {
  if (text) {
    const dotsAndSlashes = /\b(\d{1,2})[./]\s?(\d{1,2})[./]\s?(\d{2,4})\b/g
    const candidates = []

    let match
    while ((match = dotsAndSlashes.exec(text)) !== null) {
      const candidate = parseDotsMatch(match, pivot)
      if (candidate) candidates.push(candidate)
    }

    const isoCandidates = extractIsoDates(text)
    candidates.push(...isoCandidates)

    if (candidates.length > 0) {
      candidates.sort(compareCandidates)
      return candidates[0].date
    }
  }
  return undefined
}

/**
 * Builds compact trace-safe summaries of LLM messages.
 * @param {Array<object>} messages - Chat message payload.
 * @returns {Array<object>} Summarized per-message metadata.
 */
export function summarizeTraceMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map((message, index) => {
    if (!Array.isArray(message.content)) {
      const asText = String(message.content || '')
      return {
        index,
        role: message.role,
        content_type: 'text',
        chars: asText.length,
      }
    }

    const summary = {
      index,
      role: message.role,
      content_type: 'mixed',
      images: 0,
      text_chars: 0,
      text_parts: 0,
    }

    for (const part of message.content) {
      if (part.type === 'image_url') {
        summary.images += 1
      } else if (part.type === 'text') {
        summary.text_parts += 1
        summary.text_chars += (part.text || '').length
      }
    }
    return summary
  })
}

/**
 * Replaces base64 image payloads in message content with a static redacted marker.
 * @param {Array<object>} messages - Chat message payload.
 * @returns {Array<object>} Message payload with redacted image urls.
 */
export function redactImageUrls(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) =>
          part.type === 'image_url'
            ? { type: 'image_url', image_url: { url: '[REDACTED]' } }
            : part
        )
      : message.content,
  }))
}

/**
 * Checks if a string value represents a truthy state (true, 1).
 * @param {string|undefined} value - Environment variable value.
 * @returns {boolean} True if truthy.
 */
export function isTruthyEnvironment(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'true' || normalized === '1'
}

/**
 * Parses a positive integer from a string, with a default fallback.
 * @param {string|undefined} value - String to parse.
 * @param {number} defaultValue - Fallback value.
 * @param {string} name - Parameter name for error reporting.
 * @returns {number} Parsed integer.
 * @throws {TypeError} If result is not a positive integer.
 */
export function parsePositiveInteger(value, defaultValue, name) {
  const parsed = value === undefined ? defaultValue : Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`)
  }
  return parsed
}

/**
 * Ensures value is a non-empty string.
 * @param {string} value - Value to check.
 * @param {string} name - Variable name for error.
 * @throws {TypeError}
 */
export function ensureString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

/**
 * Ensures value is an array.
 * @param {Array} value - Value to check.
 * @param {string} name - Variable name for error.
 * @throws {TypeError}
 */
export function ensureArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`)
  }
}

/**
 * Ensures value is a non-null object.
 * @param {object} value - Value to check.
 * @param {string} name - Variable name for error.
 * @throws {TypeError}
 */
export function ensureObject(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
}

/**
 * Ensures a file exists on disk.
 * @param {string} filePath - Path to check.
 * @throws {TypeError} If filePath is not a valid non-empty string.
 * @throws {Error} If file does not exist at filePath.
 */
export function ensureFileExists(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError(
      `filePath must be a non-empty string, got: ${typeof filePath}`
    )
  }
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
}
