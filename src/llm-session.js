/**
 * @file Session management for per-file LLM interactions.
 */

import { ensureObject } from './utilities.js'

function trimToLimit(value, limit) {
  if (!value) return ''
  if (!Number.isInteger(limit) || limit <= 0) return ''
  return value.length > limit ? value.slice(-limit) : value
}

function toTurnLine(turn) {
  const prompt = turn.userPrompt || '(initial)'
  const result = turn.result || {}
  const company = result.company || '-'
  const title = result.title || '-'
  const date = result.date || '-'
  return `Prompt: ${prompt} | company: ${company} | title: ${title} | date: ${date}`
}

function appendSessionSummary(session, overflowTurns, maxSummaryChars) {
  const lines = overflowTurns.map((turn) => toTurnLine(turn)).join('\n')
  const combined = [session.summary, lines].filter(Boolean).join('\n')
  session.summary = trimToLimit(combined, maxSummaryChars)
}

function compactSessionHistory(session, maxTurns, maxSummaryChars) {
  if (session.history.length <= maxTurns) return

  const overflowCount = session.history.length - maxTurns
  const overflowTurns = session.history.splice(0, overflowCount)
  appendSessionSummary(session, overflowTurns, maxSummaryChars)
}

function createSessionTurn(userPrompt, result) {
  return {
    result: {
      company: result?.company,
      date: result?.date,
      title: result?.title,
      vision_check: result?.vision_check,
    },
    userPrompt: userPrompt || '',
  }
}

function ensureSessionHistory(session) {
  if (Array.isArray(session.history)) return
  session.history = []
}

/**
 * Updates per-file LLM session with a new interaction turn.
 * @param {object} session - Session object.
 * @param {string} userPrompt - User refinement prompt.
 * @param {object} result - Parsed LLM result.
 * @param {object} limits - Session retention limits.
 * @param {number} limits.maxTurns - Maximum number of turns kept in history.
 * @param {number} limits.maxSummaryChars - Maximum summary size.
 * @returns {void}
 */
export function updateSession(session, userPrompt, result, limits) {
  ensureObject(session, 'session')
  ensureObject(limits, 'limits')
  const { maxSummaryChars = 2000, maxTurns = 6 } = limits

  const turn = createSessionTurn(userPrompt, result)
  ensureSessionHistory(session)
  session.history.push(turn)
  compactSessionHistory(session, maxTurns, maxSummaryChars)
}

/**
 * Builds a compact context block for the current per-file session.
 * @param {object|undefined} session - Session object.
 * @returns {string} Formatted context text for the user message.
 */
export function buildSessionContextBlock(session) {
  if (!session) return ''

  const parts = []
  if (session.summary) {
    parts.push(`SHRNUTÍ PŘEDCHOZÍCH KROKŮ:\n${session.summary}`)
  }
  if (Array.isArray(session.history) && session.history.length > 0) {
    const historyLines = session.history
      .map((turn) => toTurnLine(turn))
      .join('\n')
    parts.push(`NEDÁVNÉ KROKY:\n${historyLines}`)
  }

  return parts.length > 0 ? `\n\nKONTEXT SOUBORU:\n${parts.join('\n\n')}` : ''
}
