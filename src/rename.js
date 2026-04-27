/**
 * @file Module for building and cleaning filenames.
 */
import { existsSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

const FORBIDDEN_CHARS = /[:/\\|"*?<>]/g

/**
 * Normalises company name by removing legal suffixes.
 * @param {string} company - Company name.
 * @returns {string|undefined} Normalised name.
 */
export function normalizeCompany(company) {
  if (company && company !== 'null') {
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

    return cleanName || undefined
  }
  return undefined
}

function sanitize(string_) {
  if (!string_) return ''
  return string_.replaceAll(FORBIDDEN_CHARS, '').replaceAll(/\s+/g, ' ').trim()
}

/**
 * Normalises title to max 6 words.
 * @param {string} title - Original name.
 * @returns {string|undefined} Normalised name.
 */
export function normalizeTitle(title) {
  if (title && title !== 'null') {
    return (
      title
        .replaceAll(/[™®©]/g, '')
        .split(/\s+/)
        .slice(0, 6)
        .join(' ')
        .trim() || undefined
    )
  }
  return undefined
}

function addCompanyPart(parts, company) {
  const normalized = normalizeCompany(company)
  if (normalized) {
    const cleanCompany = sanitize(normalized)
    if (cleanCompany) parts.push(`(${cleanCompany})`)
  }
}

function addTitlePart(parts, title) {
  const normalized = normalizeTitle(title)
  if (normalized) {
    const cleanTitle = sanitize(normalized)
    if (cleanTitle) parts.push(cleanTitle)
  }
}

/**
 * Builds final filename from parts.
 * @param {object} params - Build parameters.
 * @param {string} params.date - Date.
 * @param {string} params.company - Company.
 * @param {string} params.title - Title.
 * @param {string} params.extension - File extension.
 * @param {boolean} params.isMtime - If MTime was used.
 * @returns {string} Built name.
 */
export function assembleFilename({ date, company, title, extension, isMtime }) {
  const parts = []

  if (date && date !== 'null') {
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

function getSafeName(base, suffix, extension) {
  let current = `${base}${suffix}${extension}`
  while (Buffer.byteLength(current, 'utf8') > 255) {
    base = base.slice(0, -1)
    current = `${base}${suffix}${extension}`
  }
  return current
}

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
 * Safely renames file and solves collisions.
 * @param {string} oldPath - Original path.
 * @param {string} newName - New name.
 * @returns {string} Final safe file path.
 */
export function performRename(oldPath, newName) {
  const directory = path.dirname(oldPath)
  const { name, ext } = path.parse(newName)

  const finalPath = resolveSafePath(directory, name, ext)
  renameSync(oldPath, finalPath)
  return finalPath
}

/**
 * Gets last modification date (MTime).
 * @param {string} filePath - File path.
 * @returns {string} Date as YYYY-MM-DD.
 */
export function getMtimeDate(filePath) {
  const stats = statSync(filePath)
  return stats.mtime.toISOString().split('T')[0]
}
