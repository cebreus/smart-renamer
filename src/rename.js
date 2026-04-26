import { statSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';

/**
 * Filename assembly and sanitization module.
 * Cross-referenced with PRD Section 2 and FR-08.
 */

const FORBIDDEN_CHARS = /[:/\\|"*?<>]/g;
const LEGAL_SUFFIXES = /\s+(s\.r\.o\.|a\.s\.|inc\.|ltd\.|gmbh|corp\.|plc\.|llc)\.?$/i;

/**
 * Sanitizes a string for use in a filename.
 * @param {string} string_ - Raw string.
 * @returns {string} - Sanitized string.
 */
function sanitize(string_) {
  if (!string_) return '';
  return string_
    .replaceAll(FORBIDDEN_CHARS, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes company name by removing legal suffixes.
 * @param {string} company - Company name.
 * @returns {string|undefined} - Normalized name.
 */
export function normalizeCompany(company) {
  if (!company) return;
  return company.replace(LEGAL_SUFFIXES, '').trim();
}

/**
 * Normalizes description by removing marks and limiting words.
 * @param {string} title - Document title.
 * @returns {string|undefined} - Normalized title.
 */
export function normalizeTitle(title) {
  if (!title) return;
  return title
    .replaceAll(/[™®©]/g, '')
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .trim();
}

/**
 * Adds company part to filename components.
 * @param {string[]} parts
 * @param {string|undefined} company
 */
function addCompanyPart(parts, company) {
  if (company) {
    const cleanCompany = sanitize(normalizeCompany(company));
    if (cleanCompany) parts.push(`(${cleanCompany})`);
  }
}

/**
 * Adds title part to filename components.
 * @param {string[]} parts
 * @param {string|undefined} title
 */
function addTitlePart(parts, title) {
  if (title) {
    const cleanTitle = sanitize(normalizeTitle(title));
    if (cleanTitle) parts.push(cleanTitle);
  }
}

/**
 * Assembles the new filename components into a string.
 * @param {object} components - Components.
 * @param {string} [components.date] - Date string.
 * @param {string} [components.company] - Company string.
 * @param {string} [components.title] - Title string.
 * @param {string} components.extension - Extension.
 * @param {boolean} components.isMtime - Fallback flag.
 * @returns {string} - Assembled filename.
 */
export function assembleFilename({ date, company, title, extension, isMtime }) {
  const parts = [];

  if (date) {
    parts.push(isMtime ? `~${date}` : date);
  }

  addCompanyPart(parts, company);
  addTitlePart(parts, title);

  const baseName = parts.join(' ').trim();
  const extension_ = extension.toLowerCase();

  if (!baseName) {
    return `Unnamed_${Date.now()}${extension_}`;
  }

  return `${baseName}${extension_}`;
}

/**
 * Resolves name collisions and respects 255-byte limit.
 * @param {string} directory - Target directory.
 * @param {string} name - Desired name.
 * @param {string} extension - File extension.
 * @returns {string} - Final safe filename.
 */
function resolveSafePath(directory, name, extension) {
  const getSafeName = (base, suffix) => {
    let current = `${base}${suffix}${extension}`;
    while (Buffer.byteLength(current, 'utf8') > 255) {
      base = base.slice(0, -1);
      current = `${base}${suffix}${extension}`;
    }
    return current;
  };

  let finalName = getSafeName(name, '');
  let counter = 0;

  while (existsSync(path.join(directory, finalName))) {
    counter += 1;
    finalName = getSafeName(name, ` (${counter})`);
    if (counter > 999) break;
  }

  return path.join(directory, finalName);
}

/**
 * Safely renames a file.
 * @param {string} oldPath - Absolute path.
 * @param {string} newName - Desired new filename.
 * @returns {string} - Final absolute path.
 */
export function performRename(oldPath, newName) {
  const directory = path.dirname(oldPath);
  const { name, ext } = path.parse(newName);
  
  const finalPath = resolveSafePath(directory, name, ext);
  renameSync(oldPath, finalPath);
  return finalPath;
}

/**
 * Gets file modification date.
 * @param {string} filePath - Absolute path.
 * @returns {string} - YYYY-MM-DD.
 */
export function getMtimeDate(filePath) {
  const stats = statSync(filePath);
  return stats.mtime.toISOString().split('T')[0];
}
