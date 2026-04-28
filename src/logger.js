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
  } catch {
    /* Ignore */
  }
}

function writeToTrace(level, message) {
  const ts = new Date().toISOString()
  const cleanMessage = message.replaceAll(ANSI_ESCAPE, '')
  try {
    rotateLogIfNeeded(CONFIG.TRACE_LOG_FILE)
    appendFileSync(
      CONFIG.TRACE_LOG_FILE,
      `[${ts}] [${level}] ${cleanMessage}\n`,
      'utf8'
    )
  } catch {
    /* Ignore */
  }
}

/**
 * Logger object for terminal and file output.
 */
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
    writeToTrace('CHYBA', message)
    process.stderr.write(`\u001B[31m\u001B[1m✖ [CHYBA] ${message}\u001B[0m\n`)
  },
  transaction(record) {
    const entry = { ts: new Date().toISOString(), ...record }
    try {
      rotateLogIfNeeded(CONFIG.LOG_FILE)
      appendFileSync(CONFIG.LOG_FILE, JSON.stringify(entry) + '\n', 'utf8')
    } catch {
      void 0
    }
  },
  separator() {
    process.stdout.write('\n' + '─'.repeat(50) + '\n\n')
  },
}
