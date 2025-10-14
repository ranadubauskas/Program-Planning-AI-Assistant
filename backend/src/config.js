// backend/src/config.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer backend/.env next to this file
const backendEnv = path.resolve(__dirname, '..', '.env');
// Fallback to repo-root .env if present
const rootEnv = path.resolve(__dirname, '..', '..', '.env');

if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

const trimLower = (v, def = '') =>
  String(v ?? def).trim().toLowerCase();

export const CONFIG = {
  PORT: process.env.PORT?.trim() || '3001',

  DATABASE_URL:
    process.env.DATABASE_URL?.trim() ||
    process.env.MONGODB_URI?.trim() ||
    'mongodb://127.0.0.1:27017/program-planning',

  AMPLIFY_BASE_URL: (process.env.AMPLIFY_BASE_URL || '').trim().replace(/\/+$/, ''),
  AMPLIFY_API_KEY: (process.env.AMPLIFY_API_KEY || '').trim(),
  AMPLIFY_MODEL: (process.env.AMPLIFY_MODEL || 'gpt-4o-mini').trim(),

  // ONE definition only:
  AMPLIFY_AUTH_SCHEME: trimLower(process.env.AMPLIFY_AUTH_SCHEME, 'bearer'),
  // default to x-api-key (most API gateways)
  AMPLIFY_API_KEY_HEADER: trimLower(process.env.AMPLIFY_API_KEY_HEADER, 'x-api-key'),

  USE_AMPLIFY: trimLower(process.env.USE_AMPLIFY, 'true') === 'true',

  JWT_SECRET: (process.env.JWT_SECRET || 'change-me').trim(),
};

// Debug (optional; comment out after confirming)
if (process.env.DEBUG_CONFIG === '1') {
  console.log('[CONFIG]', {
    PORT: CONFIG.PORT,
    DATABASE_URL: CONFIG.DATABASE_URL,
    AMPLIFY_BASE_URL: CONFIG.AMPLIFY_BASE_URL,
    AMPLIFY_AUTH_SCHEME: CONFIG.AMPLIFY_AUTH_SCHEME,
    AMPLIFY_API_KEY_HEADER: CONFIG.AMPLIFY_API_KEY_HEADER,
    USE_AMPLIFY: CONFIG.USE_AMPLIFY,
    AMPLIFY_PATH: (process.env.AMPLIFY_PATH || '').trim().replace(/\/+$/,''),
    AMPLIFY_STAGE: (process.env.AMPLIFY_STAGE || '').trim().replace(/^\/+|\/+$/g,''),
  });
}
