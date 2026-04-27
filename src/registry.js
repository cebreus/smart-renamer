/**
 * @file Registry for matching file contents.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import JSON5 from 'json5'
import safeRegex from 'safe-regex'

import { CONFIG } from './config.js'
import { logger } from './logger.js'

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
      ? registry.filter(
          (entry) => entry.pattern && entry.company && safeRegex(entry.pattern)
        )
      : []
  } catch {
    return []
  }
}

/**
 * Adds new rule to registry based on user input.
 * @param {object} entry - Registry entry.
 * @returns {void}
 */
export function addRegistryRule(entry) {
  if (!entry.pattern || !entry.company || !safeRegex(entry.pattern)) {
    logger.debug('Neplatné pravidlo pro registr, přeskakuji zápis.')
    return
  }

  const registry = loadRegistry()

  const exists = registry.some(
    (item) => item.pattern === entry.pattern && item.company === entry.company
  )
  if (exists) return

  registry.push({
    pattern: entry.pattern,
    company: entry.company,
    title: entry.title || undefined,
  })

  try {
    writeFileSync(
      CONFIG.REGISTRY_FILE,
      JSON.stringify(registry, undefined, 2),
      'utf8'
    )
    logger.warn(`Registr aktualizován: Přidáno pravidlo pro "${entry.company}"`)
  } catch (error) {
    logger.debug(`Chyba při zápisu do registru: ${error.message}`)
  }
}

function tryMatchEntry(text, entry) {
  try {
    const regex = new RegExp(entry.pattern, 'i')
    if (regex.test(text)) {
      return { company: entry.company, title: entry.title }
    }
  } catch {
    void 0
  }
  return undefined
}

/**
 * Tries to find match in registry by text.
 * @param {string} text - Text of searched document.
 * @param {Array<object>} registry - Loaded registry.
 * @returns {object} Match result (company and category).
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
