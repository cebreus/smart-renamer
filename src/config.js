/**
 * @file Configuration for Smart Renamer settings.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONFIG = {
  LM_STUDIO_URL: 'http://localhost:1234/v1/chat/completions',
  MODEL: 'google_gemma-4-e2b-it@bf16',
  TEMPERATURE: 0,
  MAX_TOKENS: 300,
  LLM_TIMEOUT_MS: 35_000,
  TOKEN_LIMIT_CHARS: 6000,

  IMAGE_MAX_BYTES: 4_194_304,
  RENDER_MAX_DIM_PX: 2000,
  RENDER_DPI: 72,
  RENDER_MAX_PAGES: 4,
  JPG_QUALITY: 0.8,
  OCR_MIN_CHARS: 30,

  REGISTRY_FILE: path.join(ROOT_DIR, 'registry.json5'),
  LOG_FILE: path.join(ROOT_DIR, 'smart-renamer.log'),
  TRACE_LOG_FILE: path.join(ROOT_DIR, 'smart-renamer.trace.log'),

  DRY_RUN: process.env.DRY_RUN === 'true',
  FORCE: process.env.FORCE === 'true',
  VALUE_BLACKLIST: [],
}
