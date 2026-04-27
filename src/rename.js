import { existsSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Filename assembly and sanitization module.
 * Cross-referenced with PRD Section 2 and FR-08.
 */

const FORBIDDEN_CHARS = /[:/\\|"*?<>]/g

/**
 * Normalizes company name by removing legal suffixes.
 * @param {string} company - Company name string.
 * @returns {string|undefined} - Normalized name string.
 */
export function normalizeCompany(company) {
  if (company) {
    const suffixes = [
      's.r.o.',
      'a.s.',
      'inc.',
      'ltd.',
      'gmbh',
      'corp.',
      'plc.',
      'llc',
    ]
    let cleanName = company.trim()

    for (const suffix of suffixes) {
      if (cleanName.toLowerCase().endsWith(suffix)) {
        cleanName = cleanName.slice(0, -suffix.length).trim()
      }
    }

    return cleanName
  }
  return undefined
}

/**
 * Sanitizes a string for use in a filename.
 * @param {string} string_ - Raw string.
 * @returns {string} - Sanitized string.
 */
function sanitize(string_) {
  if (!string_) return ''
  return string_.replaceAll(FORBIDDEN_CHARS, '').replaceAll(/\s+/g, ' ').trim()
}

/**
 * Normalizes description by removing marks and limiting words.
 * @param {string} title - Document title string.
 * @returns {string|undefined} - Normalized title string.
 */
export function normalizeTitle(title) {
  if (title) {
    return title
      .replaceAll(/[™®©]/g, '')
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
      .trim()
  }
  return undefined
}

/**
 * Adds company part to filename components.
 * @param {string[]} parts - Parts array.
 * @param {string|undefined} company - Company string.
 */
function addCompanyPart(parts, company) {
  if (company) {
    const cleanCompany = sanitize(normalizeCompany(company))
    if (cleanCompany) parts.push(`(${cleanCompany})`)
  }
}

/**
 * Adds title part to filename components.
 * @param {string[]} parts - Parts array.
 * @param {string|undefined} title - Title string.
 */
function addTitlePart(parts, title) {
  if (title) {
    const cleanTitle = sanitize(normalizeTitle(title))
    if (cleanTitle) parts.push(cleanTitle)
  }
}

/**
 * Assembles the new filename components into a string.
 * @param {object} components - Components object.
 * @param {string} [components.date] - Date string.
 * @param {string} [components.company] - Company string.
 * @param {string} [components.title] - Title string.
 * @param {string} components.extension - File extension.
 * @param {boolean} components.isMtime - Fallback flag.
 * @returns {string} - Assembled filename string.
 */
export function assembleFilename({ date, company, title, extension, isMtime }) {
  const parts = []

  if (date) {
    parts.push(isMtime ? `~${date}` : date)
  }

  addCompanyPart(parts, company)
  addTitlePart(parts, title)

  const baseName = parts.join(' ').trim()
  const extension_ = extension.toLowerCase()

  if (!baseName) {
    return `Unnamed_${Date.now()}${extension_}`
  }

  return `${baseName}${extension_}`
}

/**
 * Calculates safe filename within byte limit.
 * @param {string} base - Base name string.
 * @param {string} suffix - Collision suffix string.
 * @param {string} extension - Extension string.
 * @returns {string} - Safe name string.
 */
function getSafeName(base, suffix, extension) {
  let current = `${base}${suffix}${extension}`
  while (Buffer.byteLength(current, 'utf8') > 255) {
    base = base.slice(0, -1)
    current = `${base}${suffix}${extension}`
  }
  return current
}

/**
 * Resolves name collisions and respects 255-byte limit.
 * @param {string} directory - Target directory.
 * @param {string} name - Desired name.
 * @param {string} extension - File extension.
 * @returns {string} - Final safe path string.
 */
function resolveSafePath(directory, name, extension) {
  let finalName = getSafeName(name, '', extension)
  let counter = 0

  while (existsSync(path.join(directory, finalName))) {
    counter += 1
    finalName = getSafeName(name, ` (${counter})`, extension)
    if (counter > 999) break
  }

  return path.join(directory, finalName)
}

/**
 * Safely renames a file.
 * @param {string} oldPath - Absolute path string.
 * @param {string} newName - Desired new filename.
 * @returns {string} - Final absolute path.
 */
export function performRename(oldPath, newName) {
  const directory = path.dirname(oldPath)
  const { name, ext } = path.parse(newName)

  const finalPath = resolveSafePath(directory, name, ext)
  renameSync(oldPath, finalPath)
  return finalPath
}

/**
 * Gets file modification date.
 * @param {string} filePath - Absolute path to file.
 * @returns {string} - YYYY-MM-DD string.
 */
export function getMtimeDate(filePath) {
  const stats = statSync(filePath)
  return stats.mtime.toISOString().split('T')[0]
}
