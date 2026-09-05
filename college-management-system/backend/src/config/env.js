/**
 * config/env.js
 * -----------------------------------------------------------------------------
 * Loads environment variables from `.env` (via dotenv) and exposes a single,
 * validated, typed configuration object for the rest of the backend.
 *
 * This is the ONLY place `process.env` is read. Everything else imports `env`.
 * No secrets are hard-coded here — real values live only in `.env` (gitignored).
 * -----------------------------------------------------------------------------
 */
'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env from the backend root (two levels up from src/config).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Parse a boolean-ish env string ("true"/"1"/"yes") into a real boolean. */
function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

/** Split a comma-separated env value into a trimmed, non-empty array. */
function toList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';

const env = {
  NODE_ENV,
  isProduction: NODE_ENV === 'production',

  // ---- Server ----
  PORT: Number(process.env.PORT) || 5000,

  // ---- CORS ----
  // Allowed frontend origins (comma-separated). Sensible dev defaults are used
  // only when FRONTEND_URL is not provided.
  FRONTEND_ORIGINS: (() => {
    const configured = toList(process.env.FRONTEND_URL);
    if (configured.length > 0) return configured;
    return [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
    ];
  })(),

  // ---- PostgreSQL ----
  db: {
    // Preferred single connection string; falls back to individual vars.
    connectionString: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'college_cms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: toBool(process.env.DB_SSL, false),
  },

  // ---- Firebase Admin ----
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    // Env files store the key with literal "\n"; convert to real newlines.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    // Firebase Cloud Storage bucket (e.g. college-94cd7.firebasestorage.app).
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },
};

/** True when all three Firebase Admin credentials are present. */
env.firebase.isConfigured = Boolean(
  env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey
);

/** True when either a connection string or a DB name+host is available. */
env.db.isConfigured = Boolean(env.db.connectionString || (env.db.host && env.db.name));

module.exports = { env, toBool, toList };
