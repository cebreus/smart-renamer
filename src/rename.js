/**
 * @file Module for building and cleaning filenames.
 */

import { existsSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

import { ensureFileExists, ensureObject, ensureString } from './utilities.js'

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
    const words = title.replaceAll(/[™®©]/g, '').split(/\s+/).slice(0, 6)

    // Remove trailing short prepositions to keep the title clean
    const prepositions = new Set([
      'v',
      'z',
      'o',
      'u',
      's',
      'k',
      'a',
      'i',
      'do',
      'na',
      'ze',
      've',
      'ke',
      'se',
    ])
    while (words.length > 0 && prepositions.has(words.at(-1).toLowerCase())) {
      words.pop()
    }

    return words.join(' ').trim() || undefined
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
 * @param {object} parameters - Build parameters.
 * @param {string} parameters.date - Date (YYYY-MM-DD).
 * @param {string} parameters.company - Company name.
 * @param {string} parameters.title - Document title.
 * @param {string} parameters.extension - File extension.
 * @param {boolean} parameters.isMtime - Whether MTime was used for the date.
 * @returns {string} Built name.
 */
export function assembleFilename(parameters) {
  ensureObject(parameters, 'parameters')
  const { date, company, title, extension, isMtime } = parameters
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
  const suffixAndExtension = `${suffix}${extension}`
  const maxAllowed = 255 - Buffer.byteLength(suffixAndExtension, 'utf8')

  if (maxAllowed < 0) {
    throw new Error(
      `Suffix and extension exceed filename byte limit: ${suffixAndExtension}`
    )
  }

  if (Buffer.byteLength(base, 'utf8') <= maxAllowed) {
    return `${base}${suffixAndExtension}`
  }

  let trimmedBase = ''
  for (const character of base) {
    const candidate = `${trimmedBase}${character}`
    if (Buffer.byteLength(candidate, 'utf8') > maxAllowed) {
      break
    }
    trimmedBase = candidate
  }

  return `${trimmedBase}${suffixAndExtension}`
}

function isInsideBaseDirectory(resolvedPath, baseDirectory) {
  const relative = path.relative(baseDirectory, resolvedPath)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

function resolveSafePath(
  directory,
  name,
  extension,
  baseDirectory = directory
) {
  let finalName = getSafeName(name, '', extension)
  let counter = 0

  let candidate = path.resolve(directory, finalName)
  if (!isInsideBaseDirectory(candidate, path.resolve(baseDirectory))) {
    throw new Error(`Invalid target path outside base directory: ${candidate}`)
  }

  while (existsSync(candidate)) {
    counter += 1
    finalName = getSafeName(name, ` (${counter})`, extension)
    candidate = path.resolve(directory, finalName)
    if (!isInsideBaseDirectory(candidate, path.resolve(baseDirectory))) {
      throw new Error(
        `Invalid target path outside base directory: ${candidate}`
      )
    }
    if (counter > 999) {
      throw new Error('Unable to find non-colliding path after 1000 attempts')
    }
  }

  return candidate
}

/**
 * Safely renames file back to original path.
 * @param {string} currentPath - Current path.
 * @param {string} targetPath - Target (original) path.
 * @returns {string} Final path.
 */
export function performUndo(currentPath, targetPath) {
  ensureString(currentPath, 'currentPath')
  ensureString(targetPath, 'targetPath')
  const baseDirectory = path.resolve(path.dirname(targetPath))
  const resolvedCurrentPath = path.resolve(currentPath)
  const resolvedTargetPath = path.resolve(targetPath)

  if (!isInsideBaseDirectory(resolvedTargetPath, baseDirectory)) {
    throw new Error(
      `Invalid target path outside base directory: ${resolvedTargetPath}`
    )
  }

  try {
    ensureFileExists(resolvedCurrentPath)
  } catch (error) {
    const newError = new Error(
      `File not found during rename: ${resolvedCurrentPath}`
    )
    newError.code = 'FILE_NOT_FOUND'
    throw Object.assign(newError, { cause: error })
  }

  const directory = path.dirname(resolvedTargetPath)
  const { name, ext } = path.parse(resolvedTargetPath)

  const finalPath = resolveSafePath(directory, name, ext, baseDirectory)
  renameSync(resolvedCurrentPath, finalPath)
  return finalPath
}

/**
 * Safely renames file and solves collisions.
 * @param {string} oldPath - Original path.
 * @param {string} newName - New name.
 * @returns {string} Final safe file path.
 */
export function performRename(oldPath, newName) {
  ensureString(oldPath, 'oldPath')
  ensureString(newName, 'newName')
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
  ensureString(filePath, 'filePath')
  const stats = statSync(filePath)
  return stats.mtime.toISOString().split('T')[0]
}

/**
 * Split an edited filename (no extension) into date, company, and title.
 * @param {string} filename - The edited filename (without extension).
 * @returns {object} Object containing date, company, and title.
 */
export function parseProposedName(filename) {
  let date, company, title
  let remaining = filename.trim()

  const dateMatch = remaining.match(/^~?\d{4}-\d{2}-\d{2}/)
  if (dateMatch) {
    date = dateMatch[0].replace('~', '')
    remaining = remaining.slice(dateMatch[0].length).trim()
  }

  const companyMatch = remaining.match(/^\(([^)]+)\)/)
  if (companyMatch) {
    company = companyMatch[1].trim()
    remaining = remaining.slice(companyMatch[0].length).trim()
  }

  if (remaining) {
    title = remaining
  }

  return { date, company, title }
}
