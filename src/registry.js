/**
 * @file Registry for matching file contents.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import JSON5 from 'json5'
import safeRegex from 'safe-regex'

import { CONFIG } from './config.js'
import { logger } from './logger.js'

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
    logger.warn(`Registr: příliš krátký pattern, přeskakuji: "${pattern}"`)
    return false
  }
  return true
}

function getMatchMode(entry) {
  const matchMode = entry?.matchMode || 'substring'
  if (!['substring', 'exact', 'regex'].includes(matchMode)) {
    logger.warn(`Registr: neznámý matchMode "${matchMode}", přeskakuji.`)
    return undefined
  }
  return matchMode
}

function isRegexPatternValid(pattern, matchMode) {
  if (matchMode === 'regex' && !safeRegex(pattern)) {
    logger.warn(`Registr: nebezpečný regex, přeskakuji: "${pattern}"`)
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

  return {
    pattern: basic.pattern,
    company: basic.company,
    title,
    titles,
    matchMode,
  }
}

/**
 * Loads user registry from disk.
 * @returns {Array<object>} Loaded registry.
 */
export function loadRegistry() {
  const filePath = CONFIG.REGISTRY_FILE
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    const registry = JSON5.parse(content)
    return Array.isArray(registry)
      ? registry.map((entry) => normalizeEntry(entry)).filter(Boolean)
      : []
  } catch (error) {
    logger.warn(`Nepodařilo se načíst nebo parsovat registr: ${error.message}`)
    return []
  }
}

/**
 * Adds new rule to registry based on user input.
 * @param {object} entry - Registry entry.
 * @returns {void}
 */
export function addRegistryRule(entry) {
  const normalized = normalizeEntry(entry)
  if (!normalized) {
    logger.debug('Neplatné pravidlo pro registr, přeskakuji zápis.')
    return
  }

  const registry = loadRegistry()

  const hasExistingRule = registry.some(
    (item) =>
      item.pattern === normalized.pattern && item.company === normalized.company
  )
  if (hasExistingRule) return

  registry.push(normalized)

  try {
    writeFileSync(
      CONFIG.REGISTRY_FILE,
      JSON.stringify(registry, undefined, 2),
      'utf8'
    )
    logger.info(
      `Registr aktualizován: Přidáno pravidlo pro "${normalized.company}"`
    )
  } catch (error) {
    logger.debug(`Chyba při zápisu do registru: ${error.message}`)
  }
}

function tryMatchEntry(text, entry) {
  try {
    const target = text.toLocaleLowerCase('cs-CZ')
    const pattern = String(entry.pattern)
    let isMatched = false

    if (entry.matchMode === 'exact') {
      isMatched = target === pattern.toLocaleLowerCase('cs-CZ')
    } else if (entry.matchMode === 'regex') {
      isMatched = new RegExp(pattern, 'iu').test(text)
    } else {
      isMatched = new RegExp(escapeRegex(pattern), 'iu').test(text)
    }

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
 * Tries to find match in registry by text.
 * @param {string} text - Text of searched document.
 * @param {Array<object>} registry - Loaded registry.
 * @returns {object} Match result (company and title).
 */
export function matchRegistry(text, registry) {
  if (text && registry?.length > 0) {
    for (const entry of registry) {
      const match = tryMatchEntry(text, entry)
      if (match) return match
    }
  }
  return { company: undefined, title: undefined }
}
