/**
 * @file General tools for Smart Renamer.
 */

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

function parseDotsMatch(match) {
  const day = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  let year = Number.parseInt(match[3], 10)

  if (year < 100) {
    year += year <= 50 ? 2000 : 1900
  }

  if (isValidDate(day, month, year)) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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
      candidates.push(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      )
    }
  }
  return candidates
}

/**
 * Extracts date from text using fallback regex.
 * @param {string} text - Input text to search.
 * @returns {string|undefined} Found date as YYYY-MM-DD or undefined.
 */
export function extractDateFallback(text) {
  if (text) {
    const dotsAndSlashes = /\b(\d{1,2})[./]\s?(\d{1,2})[./]\s?(\d{2,4})\b/g
    const candidates = []

    let match
    while ((match = dotsAndSlashes.exec(text)) !== null) {
      const candidate = parseDotsMatch(match)
      if (candidate) candidates.push(candidate)
    }

    const isoCandidates = extractIsoDates(text)
    candidates.push(...isoCandidates)

    if (candidates.length > 0) {
      return candidates[0]
    }
  }
  return undefined
}
