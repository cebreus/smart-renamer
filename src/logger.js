/**
 * @file Logger module for terminal and file output.
 */

import {
  appendFileSync,
  existsSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'

import { CONFIG } from './config.js'
import { ensureObject, ensureString } from './utilities.js'

const MAX_LOG_SIZE = 10_485_760
const MAX_ROTATIONS = 3
const loggerContext = {
  runId: undefined,
  operationId: undefined,
  logFile: undefined,
  traceLogFile: undefined,
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001B\[[0-9;]*m/g

function shiftRotations(logFile) {
  for (let index = MAX_ROTATIONS - 1; index >= 1; index -= 1) {
    const oldName = `${logFile}.${index}`
    const newName = `${logFile}.${index + 1}`
    if (existsSync(oldName)) {
      if (index + 1 === MAX_ROTATIONS && existsSync(newName)) {
        unlinkSync(newName)
      }
      renameSync(oldName, newName)
    }
  }
}

function rotate(logFile) {
  renameSync(logFile, `${logFile}.1`)
}

function rotateLogIfNeeded(logFile) {
  if (!existsSync(logFile)) return

  try {
    const stats = statSync(logFile)
    if (stats.size >= MAX_LOG_SIZE) {
      shiftRotations(logFile)
      rotate(logFile)
    }
  } catch (error) {
    if (process.env.DEBUG === 'true') {
      console.error(`rotateLogIfNeeded failed for ${logFile}:`, error)
    }
  }
}

function getLogPaths() {
  return {
    logFile: loggerContext.logFile || CONFIG.LOG_FILE,
    traceLogFile: loggerContext.traceLogFile || CONFIG.TRACE_LOG_FILE,
  }
}

function getContextParts() {
  const parts = []
  if (loggerContext.runId) parts.push(`run_id=${loggerContext.runId}`)
  if (loggerContext.operationId)
    parts.push(`operation_id=${loggerContext.operationId}`)
  return parts
}

function buildContextPrefix() {
  const parts = getContextParts()
  if (parts.length === 0) return ''
  return ` [${parts.join('] [')}]`
}

function writeToTrace(level, message) {
  const ts = new Date().toISOString()
  const cleanMessage = message.replaceAll(ANSI_ESCAPE, '')
  const contextPrefix = buildContextPrefix()
  const { traceLogFile } = getLogPaths()
  try {
    rotateLogIfNeeded(traceLogFile)
    appendFileSync(
      traceLogFile,
      `[${ts}] [${level}]${contextPrefix} ${cleanMessage}\n`,
      'utf8'
    )
  } catch (error) {
    // If writing trace fails, ignore the error so the program can continue.
    if (process.env.DEBUG === 'true') {
      console.error('Trace write failed:', error)
    }
  }
}

/**
 * Sets the run ID for the current execution.
 * @param {string} runId - Unique run identifier.
 * @returns {void}
 */
export function setRunId(runId) {
  ensureString(runId, 'runId')
  loggerContext.runId = runId
}

/**
 * Sets the operation ID for the current file processing.
 * @param {string} operationId - Unique operation identifier.
 * @returns {void}
 */
export function setOperationId(operationId) {
  ensureString(operationId, 'operationId')
  loggerContext.operationId = operationId
}

/**
 * Clears the current operation ID.
 * @returns {void}
 */
export function clearOperationId() {
  loggerContext.operationId = undefined
}

export const logger = {
  debug(message) {
    writeToTrace('LADENI', message)
    process.stdout.write(`\u001B[2m[LADENI] ${message}\u001B[0m\n`)
  },
  info(message) {
    writeToTrace('INFO', message)
    process.stdout.write(`${message}\n`)
  },
  status(step, message) {
    this.info(`[${step}/3] ${message}`)
  },
  warn(message) {
    writeToTrace('VAROVANI', message)
    process.stderr.write(`\u001B[33m⚠ [VAROVANI] ${message}\u001B[0m\n`)
  },
  error(message) {
    ensureString(message, 'message')
    writeToTrace('CHYBA', message)
    process.stderr.write(`\u001B[31m\u001B[1m✖ [CHYBA] ${message}\u001B[0m\n`)
  },
  transaction(record) {
    ensureObject(record, 'record')
    const entry = {
      ts: new Date().toISOString(),
      ...record,
      run_id: loggerContext.runId,
      operation_id: loggerContext.operationId,
    }
    const { logFile } = getLogPaths()
    try {
      rotateLogIfNeeded(logFile)
      appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8')
    } catch (error) {
      const details = error?.message || String(error)
      process.stderr.write(
        `\u001B[33m⚠ [VAROVANI] Zápis transakčního logu selhal: ${details}\u001B[0m\n`
      )
    }
  },
  separator() {
    process.stdout.write('\n' + '─'.repeat(50) + '\n\n')
  },

  /**
   * Configures logger instance.
   * @param {object} [options] - Configuration options.
   * @param {string} [options.logFile] - Custom path for transaction log.
   * @param {string} [options.traceLogFile] - Custom path for trace log.
   * @param {boolean} [options.reset] - Whether to clear IDs.
   * @returns {void}
   */
  setup({ logFile, traceLogFile, reset = false } = {}) {
    if (reset) {
      loggerContext.runId = undefined
      loggerContext.operationId = undefined
    }
    if (logFile !== undefined) {
      if (logFile === null) {
        delete loggerContext.logFile
      } else {
        loggerContext.logFile = logFile
      }
    }
    if (traceLogFile !== undefined) {
      if (traceLogFile === null) {
        delete loggerContext.traceLogFile
      } else {
        loggerContext.traceLogFile = traceLogFile
      }
    }
  },
}
