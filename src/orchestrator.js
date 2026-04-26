import path from 'node:path';
import { CONFIG } from './config.js';
import { runOCR, cleanupOCRImage } from './ocr.js';
import { loadRegistry, matchRegistry } from './registry.js';
import { analyzeDocument } from './llm.js';
import { assembleFilename, performRename, getMtimeDate } from './rename.js';
import { logTransaction } from './logger.js';
import { showInputDialog, sanitizeUserInput } from './ui.js';
import { extractDateFallback, logStatus } from './utilities.js';

/**
 * Orchestrator module that connects all pipeline steps.
 * Cross-referenced with ARCHITECTURE Section 2 and PRD Section 7.1.
 */

/**
 * Extracts metadata using multiple strategies.
 * @param {string} text - OCR text.
 * @param {string} [imagePath] - Path to temp image.
 * @param {string} originalName - Original filename.
 * @returns {Promise<object>} - Extracted metadata.
 */
async function extractMetadata(text, imagePath, originalName) {
  const registry = loadRegistry();
  const registryMatch = matchRegistry(text, registry);
  
  let llmResult;
  if (text.length >= CONFIG.OCR_MIN_CHARS) {
    logStatus(2, 'Analýza dokumentu (AI)...');
    llmResult = await analyzeDocument({
      text,
      imagePath,
      originalName,
    });
  }

  return {
    company: registryMatch.company ?? llmResult?.company,
    title: registryMatch.title ?? llmResult?.title,
    date: llmResult?.date,
  };
}

/**
 * Resolves the document date using fallbacks.
 * @param {string} text - OCR text.
 * @param {string} absPath - Absolute path to file.
 * @param {string} [initialDate] - Date from LLM.
 * @returns {object} - { date, isMtime }
 */
function resolveDate(text, absPath, initialDate) {
  let date = initialDate;
  let isMtime = false;

  if (!date) {
    date = extractDateFallback(text);
  }

  if (!date) {
    date = getMtimeDate(absPath);
    isMtime = true;
  }

  return { date, isMtime };
}

/**
 * Finalizes the rename operation and logs result.
 * @param {string} absPath - Source path.
 * @param {string} newFilename - Target name.
 * @param {boolean} isMtime - Date fallback flag.
 */
function finalizeRename(absPath, newFilename, isMtime) {
  if (newFilename === path.basename(absPath)) {
    logStatus(3, 'Název je již optimální, přeskakuji.');
    logTransaction({ status: 'skipped_no_change', original_abs: absPath });
    return;
  }

  try {
    const finalPath = performRename(absPath, newFilename);
    logStatus(3, `Přejmenováno na: ${path.basename(finalPath)}`);
    logTransaction({ 
      status: 'ok', 
      original_abs: absPath, 
      renamed_abs: finalPath, 
      method: isMtime ? 'mtime_fallback' : 'auto',
    });
  } catch (error) {
     
    console.error(`Rename failed: ${error.message}`);
    logTransaction({ status: 'rename_failed', original_abs: absPath, error: error.message });
  }
}

/**
 * Processes a single file through the entire pipeline.
 * @param {string} filePath - Path to the file to process.
 */
export async function processFile(filePath) {
  const absPath = path.resolve(filePath);
  const originalBasename = path.basename(absPath);
  const extension = path.extname(absPath);
  const originalNameOnly = path.basename(absPath, extension);

  logStatus(1, `Extrakce textu: ${originalBasename}`);
  
  let ocrResult;
  try {
    ocrResult = await runOCR(absPath);
  } catch (error) {
     
    console.error(`OCR failed for ${originalBasename}:`, error.message);
    logTransaction({ status: 'ocr_failed', original_abs: absPath, error: error.message });
    return;
  }

  const { text, imagePath } = ocrResult;
  const metadata = await extractMetadata(text, imagePath, originalNameOnly);
  cleanupOCRImage(imagePath);

  const { date, isMtime } = resolveDate(text, absPath, metadata.date);
  let { company } = metadata;

  if (!company) {
    logStatus(3, 'Vyžadován ruční vstup pro firmu...');
    const userInput = showInputDialog(`Firma pro: ${originalBasename}`, originalNameOnly);
    company = sanitizeUserInput(userInput);
  }

  const newFilename = assembleFilename({
    date,
    company,
    title: metadata.title,
    extension,
    isMtime,
  });

  finalizeRename(absPath, newFilename, isMtime);
}
