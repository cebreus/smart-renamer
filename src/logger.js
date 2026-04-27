import {
  appendFileSync,
  existsSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'

import { CONFIG } from './config.js'

/**
 * Custom Logger module for Smart Renamer.
 * Handles both terminal output and file transactions.
 * Satisfies strict no-console rules.
 */

const MAX_LOG_SIZE = 10_485_760 // 10 MB
const MAX_ROTATIONS = 3

/**
 * Shifts existing log rotation files.
 * @param {string} logFile - Absolute path to log file.
 */
function shiftRotations(logFile) {
  for (let index = MAX_ROTATIONS - 1; index >= 1; index -= 1) {
    const oldName = `${logFile}.${index}`
    const newName = `${logFile}.${index + 1}`
    if (existsSync(oldName)) {
      if (index + 1 > MAX_ROTATIONS) {
        unlinkSync(oldName)
      } else {
        renameSync(oldName, newName)
      }
    }
  }
}

/**
 * Performs log file rotation.
 * @param {string} logFile - Absolute path to log file.
 */
function rotate(logFile) {
  shiftRotations(logFile)
  renameSync(logFile, `${logFile}.1`)
}

/**
 * Rotates logs if the current log file exceeds the size limit.
 */
function rotateLogsIfNeeded() {
  const logFile = CONFIG.LOG_FILE
  if (!existsSync(logFile)) return

  try {
    const stats = statSync(logFile)
    if (stats.size >= MAX_LOG_SIZE) {
      rotate(logFile)
    }
  } catch {
    // Silent fail
  }
}

/**
 * Logs a general message to the terminal.
 * @param {string} message - Message to log.
 */
export function logInfo(message) {
  process.stdout.write(`${message}\n`)
}

/**
 * Logs a status message with a step indicator.
 * @param {number} step - Step number.
 * @param {string} message - Status message.
 */
export function logStatus(step, message) {
  logInfo(`[${step}/3] ${message}`)
}

/**
 * Logs a warning to the terminal.
 * @param {string} message - Warning message.
 */
export function logWarn(message) {
  process.stderr.write(`[WARN] ${message}\n`)
}

/**
 * Logs an error to the terminal.
 * @param {string} message - Error message.
 */
export function logError(message) {
  process.stderr.write(`[ERROR] ${message}\n`)
}

/**
 * Logs an atomic transaction to the JSONL log file.
 * @param {object} record - Transaction data object.
 */
export function logTransaction(record) {
  const entry = {
    ts: new Date().toISOString(),
    ...record,
  }

  try {
    const line = JSON.stringify(entry) + '\n'
    appendFileSync(CONFIG.LOG_FILE, line, 'utf8')
    rotateLogsIfNeeded()
  } catch {
    // Silent fail for file logging
  }
}
