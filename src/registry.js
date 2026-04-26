import { readFileSync, existsSync } from 'node:fs';
import JSON5 from 'json5';
import safeRegex from 'safe-regex';
import { CONFIG } from './config.js';

/**
 * Registry module for deterministic matching.
 * Cross-referenced with PRD FR-07 and LOE Section 9.
 */

/**
 * Loads and validates the registry file.
 * @returns {Array<{pattern: string, company: string, title?: string}>} - Validated entries.
 */
export function loadRegistry() {
  const filePath = CONFIG.REGISTRY_FILE;
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const registry = JSON5.parse(content);

    if (!Array.isArray(registry)) {
      return [];
    }

    // Validate each pattern for ReDoS safety
    return registry.filter((entry) => {
      if (!entry.pattern || !entry.company) {
        return false;
      }
      return safeRegex(entry.pattern);
    });
  } catch {
    return [];
  }
}

/**
 * Matches OCR text against the registry.
 * @param {string} text - OCR text to match.
 * @param {Array} registry - Loaded registry entries.
 * @returns {object} - { company, title }
 */
export function matchRegistry(text, registry) {
  if (!text || !registry || registry.length === 0) {
    return { company: undefined, title: undefined };
  }

  for (const entry of registry) {
    try {
      const regex = new RegExp(entry.pattern, 'i');
      if (regex.test(text)) {
        return {
          company: entry.company,
          title: entry.title || undefined,
        };
      }
    } catch {
      continue;
    }
  }

  return { company: undefined, title: undefined };
}
