import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')

/**
 * Project configuration following "Intentional Minimalism" and "Privacy First" principles.
 * Cross-referenced with PRD v1.1 and LOE Section 9.
 */
export const CONFIG = {
  // LLM Inference (LM Studio)
  LM_STUDIO_URL: 'http://localhost:1234/v1/chat/completions',
  MODEL: 'google_gemma-4-e2b-it@bf16',
  TEMPERATURE: 0,
  MAX_TOKENS: 300,
  LLM_TIMEOUT_MS: 35_000,
  TOKEN_LIMIT_CHARS: 6000,

  // Image & OCR Processing
  IMAGE_MAX_BYTES: 4_194_304,
  RENDER_MAX_DIM_PX: 2000,
  RENDER_DPI: 72,
  RENDER_MAX_PAGES: 4,
  JPG_QUALITY: 0.8, // 80% as per PRD FR-04
  OCR_MIN_CHARS: 30,

  // Paths
  REGISTRY_FILE: path.join(ROOT_DIR, 'registry.json5'), // LOE Section 9: JSON5 format
  LOG_FILE: path.join(ROOT_DIR, 'smart-renamer.log'),

  // Business Logic
  DRY_RUN: process.env.DRY_RUN === 'true', // Default to false after verification
  VALUE_BLACKLIST: [], // To be populated with specific patterns to ignore
}
