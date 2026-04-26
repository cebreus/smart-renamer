import { spawnSync } from 'node:child_process';

/**
 * UI module for native macOS interactions.
 * Cross-referenced with PRD FR-06 and FR-11.
 */

/**
 * Shows a native macOS input dialog.
 * @param {string} promptText - The message to display.
 * @param {string} defaultAnswer - Initial text in the input field.
 * @returns {string|undefined} - The user's input or undefined if cancelled.
 */
export function showInputDialog(promptText, defaultAnswer = '') {
  // Escaping quotes for AppleScript
  const escapedPrompt = promptText.replaceAll('"', String.raw`\"`);
  const escapedDefault = defaultAnswer.replaceAll('"', String.raw`\"`);
  
  const script = String.raw`display dialog "${escapedPrompt}" default answer "${escapedDefault}" with icon note buttons {"Cancel", "OK"} default button "OK"`;
  
  const process = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });

  if (process.status !== 0) {
    return; // Cancelled or closed
  }

  // Output format: "button returned:OK, text returned:User Input"
  const match = process.stdout.match(/text returned:(.*)$/);
  return match ? match[1].trim() : undefined;
}

/**
 * Shows a native macOS confirmation dialog (Yes/No).
 * @param {string} promptText - The message to display.
 * @returns {boolean} - True if user clicked "Yes".
 */
export function showConfirmDialog(promptText) {
  const escapedPrompt = promptText.replaceAll('"', String.raw`\"`);
  const script = String.raw`display dialog "${escapedPrompt}" with icon caution buttons {"No", "Yes"} default button "Yes"`;
  
  const process = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  
  if (process.status !== 0) {
    return false;
  }

  return process.stdout.includes('button returned:Yes');
}

/**
 * Sanitizes user input for filenames.
 * Cross-referenced with PRD FR-11.
 * @param {string} input - Raw user input.
 * @returns {string} - Sanitized input.
 */
export function sanitizeUserInput(input) {
  if (!input) return '';
  
  return input
    .trim()
    .slice(0, 50) // Max 50 chars as per FR-11
    .replaceAll(/[:/\\|"*?<>]/g, '') // Remove forbidden macOS characters
    .replaceAll(/\s+/g, ' '); // Normalize whitespace
}
