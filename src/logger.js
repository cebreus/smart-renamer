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

const MAX_LOG_SIZE = 10_485_760
const MAX_ROTATIONS = 3

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

function rotate(logFile) {
  shiftRotations(logFile)
  renameSync(logFile, `${logFile}.1`)
}

function rotateLogsIfNeeded() {
  const logFile = CONFIG.LOG_FILE
  if (!existsSync(logFile)) return

  try {
    const stats = statSync(logFile)
    if (stats.size >= MAX_LOG_SIZE) {
      rotate(logFile)
    }
  } catch {
    void 0
  }
}

/**
 * Logger object for terminal and file output.
 */
export const logger = {
  debug(message) {
    process.stdout.write(`\u001B[2m[DEBUG] ${message}\u001B[0m\n`)
  },
  info(message) {
    process.stdout.write(`${message}\n`)
  },
  status(step, message) {
    this.info(`[${step}/3] ${message}`)
  },
  warn(message) {
    process.stderr.write(`\u001B[33m⚠ [WARN] ${message}\u001B[0m\n`)
  },
  error(message) {
    process.stderr.write(`\u001B[31m\u001B[1m✖ [ERROR] ${message}\u001B[0m\n`)
  },
  transaction(record) {
    const entry = { ts: new Date().toISOString(), ...record }
    try {
      appendFileSync(CONFIG.LOG_FILE, JSON.stringify(entry) + '\n', 'utf8')
      rotateLogsIfNeeded()
    } catch {
      void 0
    }
  },
}
