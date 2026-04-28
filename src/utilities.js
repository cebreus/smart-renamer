/**
 * @file General tools for Smart Renamer.
 */

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
