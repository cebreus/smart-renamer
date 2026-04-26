/**
 * General utilities for Smart Renamer.
 * Cross-referenced with PRD FR-05.
 */

/**
 * Validates date components.
 * @param {number} day - Day (1-31).
 * @param {number} month - Month (1-12).
 * @param {number} year - Year (YYYY).
 * @returns {boolean} - True if valid.
 */
function isValidDate(day, month, year) {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Parses date candidates from regex matches.
 * @param {RegExpExecArray} match
 * @returns {string|undefined}
 */
function parseDotsMatch(match) {
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  let year = Number.parseInt(match[3], 10);

  if (year < 100) {
    year += year <= 50 ? 2000 : 1900;
  }

  if (isValidDate(day, month, year)) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return;
}

/**
 * Extracts dates from text using Regex with scoring.
 * Cross-referenced with PRD FR-05 Level 2.
 * @param {string} text - OCR text.
 * @returns {string|undefined} - YYYY-MM-DD or undefined.
 */
export function extractDateFallback(text) {
  if (!text) return;

  const dotsAndSlashes = /\b(\d{1,2})[./]\s?(\d{1,2})[./]\s?(\d{2,4})\b/g;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const candidates = [];

  let match;
  while ((match = dotsAndSlashes.exec(text)) !== null) {
    const candidate = parseDotsMatch(match);
    if (candidate) candidates.push(candidate);
  }

  while ((match = iso.exec(text)) !== null) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);

    if (isValidDate(day, month, year)) {
      candidates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }

  return candidates[0];
}

/**
 * Formats status messages for CLI.
 * @param {number} step - Current step index.
 * @param {string} message - Status message.
 */
export function logStatus(step, message) {
  // eslint-disable-next-line no-console
  console.log(`[${step}/3] ${message}`);
}
