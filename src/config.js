/**
 * @file Configuration for Smart Renamer settings.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isTruthyEnvironment, parsePositiveInteger } from './utilities.js'

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const INTERACTION_MAX_STEPS = parsePositiveInteger(
  process.env.INTERACTION_MAX_STEPS,
  100,
  'INTERACTION_MAX_STEPS'
)

const VALUE_BLOCKLIST = Object.freeze([])

export const CONFIG = Object.freeze({
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
  INTERACTION_MAX_STEPS,

  REGISTRY_FILE: path.join(ROOT_DIR, 'registry.json5'),
  LOG_FILE: path.join(ROOT_DIR, 'renames.log'),
  TRACE_LOG_FILE: path.join(ROOT_DIR, 'debug.log'),
  TRACE_VERBOSE: isTruthyEnvironment(process.env.TRACE_VERBOSE),

  DRY_RUN: isTruthyEnvironment(process.env.DRY_RUN),
  FORCE: isTruthyEnvironment(process.env.FORCE),
  VALUE_BLOCKLIST,
})
