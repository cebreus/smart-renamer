import { appendFileSync, statSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { CONFIG } from './config.js';

/**
 * Transaction Logger module.
 * Cross-referenced with PRD FR-09.
 */

const MAX_LOG_SIZE = 10_485_760; // 10 MB
const MAX_ROTATIONS = 3;

/**
 * Performs log file rotation.
 * @param {string} logFile
 */
function rotate(logFile) {
  for (let index = MAX_ROTATIONS - 1; index >= 1; index -= 1) {
    const oldName = `${logFile}.${index}`;
    const newName = `${logFile}.${index + 1}`;
    if (existsSync(oldName)) {
      if (index + 1 > MAX_ROTATIONS) {
        unlinkSync(oldName);
      } else {
        renameSync(oldName, newName);
      }
    }
  }
  renameSync(logFile, `${logFile}.1`);
}

/**
 * Rotates logs if the current log file exceeds the size limit.
 */
function rotateLogsIfNeeded() {
  const logFile = CONFIG.LOG_FILE;
  if (!existsSync(logFile)) return;

  try {
    const stats = statSync(logFile);
    if (stats.size >= MAX_LOG_SIZE) {
      rotate(logFile);
    }
  } catch {
    // Silent fail
  }
}

/**
 * Logs an atomic transaction to the JSONL log file.
 * @param {object} record - Transaction data.
 */
export function logTransaction(record) {
  const entry = {
    ts: new Date().toISOString(),
    ...record,
  };

  try {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(CONFIG.LOG_FILE, line, 'utf8');
    rotateLogsIfNeeded();
  } catch {
    // Silent fail
  }
}
