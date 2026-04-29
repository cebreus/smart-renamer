/**
 * @file Registry for matching file contents.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import JSON5 from 'json5'
import safeRegex from 'safe-regex'

import { CONFIG } from './config.js'
import { logger } from './logger.js'
import { ensureArray, ensureObject, ensureString } from './utilities.js'

const MIN_PATTERN_LENGTH = 3

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\\$&`)
}

function getBasicEntry(entry) {
  if (!entry?.pattern || !entry?.company) return undefined
  const pattern = String(entry.pattern).trim()
  const company = String(entry.company).trim()
  return pattern && company ? { pattern, company } : undefined
}

function isPatternValid(pattern) {
  if (pattern.length < MIN_PATTERN_LENGTH) {
    logger.warn(`Registry: pattern too short, skipping: "${pattern}"`)
    return false
  }
  return true
}

function getMatchMode(entry) {
  const matchMode = entry?.matchMode || 'substring'
  if (!['substring', 'exact', 'regex'].includes(matchMode)) {
    logger.warn(`Registry: unknown matchMode "${matchMode}", skipping.`)
    return undefined
  }
  return matchMode
}

function isRegexPatternValid(pattern, matchMode) {
  if (matchMode === 'regex' && !safeRegex(pattern)) {
    logger.warn(`Registry: unsafe regex, skipping: "${pattern}"`)
    return false
  }
  return true
}

function getTitles(entry) {
  const titles = Array.isArray(entry.titles)
    ? entry.titles.filter(Boolean).map((item) => String(item).trim())
    : []
  const trimmedTitle = entry.title ? String(entry.title).trim() : ''
  const title = trimmedTitle || titles[0]

  return { title, titles }
}

function normalizeEntry(entry) {
  const basic = getBasicEntry(entry)
  if (!basic) return undefined
  if (!isPatternValid(basic.pattern)) return undefined

  const matchMode = getMatchMode(entry)
  if (!matchMode) return undefined
  if (!isRegexPatternValid(basic.pattern, matchMode)) return undefined

  const { title, titles } = getTitles(entry)
  let compiledRegex
  try {
    if (matchMode === 'exact') {
      compiledRegex = undefined
    } else if (matchMode === 'regex') {
      compiledRegex = new RegExp(basic.pattern, 'iu')
    } else {
      compiledRegex = new RegExp(escapeRegex(basic.pattern), 'iu')
    }
  } catch {
    logger.warn(`Registry: invalid regex pattern, skipping: "${basic.pattern}"`)
    return undefined
  }

  return {
    pattern: basic.pattern,
    company: basic.company,
    title,
    titles,
    matchMode,
    compiledRegex,
  }
}

function tryMatchEntry(text, entry) {
  try {
    const target = text.toLocaleLowerCase('cs-CZ')
    const pattern = String(entry.pattern)
    const isMatched =
      entry.matchMode === 'exact'
        ? target === pattern.toLocaleLowerCase('cs-CZ')
        : entry.compiledRegex.test(text)

    if (isMatched) {
      const title = entry.title || entry.titles?.[0]
      return { company: entry.company, title: title || undefined }
    }
  } catch {
    // Ignore malformed patterns.
  }
  return undefined
}

/**
 * Loads user registry from disk.
 * @typedef {object} RegistryEntry
 * @property {string} pattern - Search pattern.
 * @property {string} company - Company name.
 * @property {string} [title] - Optional document title.
 * @property {string[]} [titles] - List of possible titles.
 * @property {string} [matchMode] - Match mode (substring, exact, regex).
 * @property {RegExp} [compiledRegex] - Compiled regex for matching.
 * @param {string} [filePath] - Path to registry file (defaults to CONFIG).
 * @returns {RegistryEntry[]} Loaded registry.
 */
export function loadRegistry(filePath = CONFIG.REGISTRY_FILE) {
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    const registry = JSON5.parse(content)
    return Array.isArray(registry)
      ? registry.map((entry) => normalizeEntry(entry)).filter(Boolean)
      : []
  } catch (error) {
    logger.warn(`Failed to load or parse registry: ${error.message}`)
    return []
  }
}

/**
 * Adds new rule to registry based on user input.
 * @param {RegistryEntry} entry - Registry entry.
 * @param {string} [filePath] - Optional custom registry path.
 * @returns {void}
 */
export function addRegistryRule(entry, filePath = CONFIG.REGISTRY_FILE) {
  ensureObject(entry, 'entry')
  const normalized = normalizeEntry(entry)
  if (!normalized) {
    logger.debug('Invalid registry rule, skipping entry.')
    return
  }

  const registry = loadRegistry(filePath)

  const hasExistingRule = registry.some(
    (item) =>
      item.pattern === normalized.pattern && item.company === normalized.company
  )
  if (hasExistingRule) return

  registry.push(normalized)

  try {
    const serializableRegistry = registry.map(
      ({ compiledRegex, ...item }) => item
    )
    writeFileSync(
      filePath,
      JSON.stringify(serializableRegistry, undefined, 2),
      'utf8'
    )
    logger.info(`Registry updated: added rule for "${normalized.company}"`)
  } catch (error) {
    logger.warn(
      `Registry write failed: ${error.message}\n${error.stack || 'No stack'}`
    )
  }
}

/**
 * Tries to find match in registry by text.
 * @param {string} text - Text of searched document.
 * @param {RegistryEntry[]} registry - Loaded registry.
 * @returns {{company: string|undefined, title: string|undefined}|undefined} Match result with company and title.
 */
export function matchRegistry(text, registry) {
  ensureString(text, 'text')
  ensureArray(registry, 'registry')
  if (text && registry?.length > 0) {
    for (const entry of registry) {
      const match = tryMatchEntry(text, entry)
      if (match) return match
    }
  }
  return { company: undefined, title: undefined }
}
