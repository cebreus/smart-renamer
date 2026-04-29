/**
 * @file JSON parsing utilities for LLM responses.
 */

import { ensureString } from './utilities.js'

function getJsonStart(content) {
  const startArray = content.indexOf('[')
  const startObject = content.indexOf('{')
  const hasArray =
    startArray !== -1 && (startObject === -1 || startArray < startObject)
  return hasArray ? startArray : startObject
}

function createJsonParserState() {
  return {
    depth: 0,
    isEscaped: false,
    inString: false,
  }
}

function updateStringState(char, state) {
  if (!state.inString) {
    if (char === '"') {
      state.inString = true
      return true
    }
    return false
  }

  if (state.isEscaped) {
    state.isEscaped = false
    return true
  }
  if (char === '\\') {
    state.isEscaped = true
    return true
  }
  if (char === '"') state.inString = false
  return state.inString
}

function updateDepth(char, state) {
  if (char === '{' || char === '[') {
    state.depth += 1
    return false
  }
  if (char === '}' || char === ']') {
    state.depth -= 1
    return state.depth === 0
  }
  return false
}

function findJsonEnd(content, start) {
  const state = createJsonParserState()
  for (let index = start; index < content.length; index += 1) {
    const char = content[index]
    if (updateStringState(char, state)) continue
    if (updateDepth(char, state)) return index
  }
  return -1
}

/**
 * Extracts JSON object/array from content.
 * @param {string} content - Content to parse.
 * @returns {object|Array|undefined} Parsed JSON or undefined.
 */
export function extractJson(content) {
  ensureString(content, 'content')

  const startIndex = getJsonStart(content)
  if (startIndex === -1) return undefined
  const endIndex = findJsonEnd(content, startIndex)
  if (endIndex === -1) return undefined

  try {
    const jsonString = content.slice(startIndex, endIndex + 1)
    const parsed = JSON.parse(jsonString)
    return parsed
  } catch {
    return undefined
  }
}
