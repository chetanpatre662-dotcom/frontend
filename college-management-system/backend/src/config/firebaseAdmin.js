/**
 * config/firebaseAdmin.js
 * -----------------------------------------------------------------------------
 * Firebase Admin SDK initialization for the BACKEND only.
 *
 * Credentials (project id, client email, private key) are read exclusively from
 * environment variables via config/env.js. They are SECRETS and must never be
 * hard-coded here or shipped to the frontend.
 *
 * This is the ONLY place the Firebase Admin SDK is initialized. The auth
 * middleware imports `verifyIdToken` from here to validate incoming tokens.
 * -----------------------------------------------------------------------------
 */
'use strict';

const admin = require('firebase-admin');
const { env } = require('./env');

let initialized = false;
let initError = null;

/**
 * Initialize the Firebase Admin app exactly once, using credentials from env.
 * Returns a structured result instead of throwing so server startup can decide
 * how to handle a missing/invalid configuration.
 * @returns {{ok: boolean, error?: string, projectId?: string}}
 */
function initFirebaseAdmin() {
  if (initialized) {
    return { ok: true, projectId: env.firebase.projectId };
  }
  if (initError) {
    return { ok: false, error: initError };
  }

  if (!env.firebase.isConfigured) {
    initError =
      'Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, ' +
      'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in backend/.env.';
    return { ok: false, error: initError };
  }

  try {
    // Guard against double init if the SDK was already initialized elsewhere.
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.firebase.projectId,
          clientEmail: env.firebase.clientEmail,
          privateKey: env.firebase.privateKey,
        }),
      });
    }
    initialized = true;
    return { ok: true, projectId: env.firebase.projectId };
  } catch (err) {
    initError = err.message;
    return { ok: false, error: err.message };
  }
}

/** Whether Firebase Admin has been successfully initialized. */
function isInitialized() {
  return initialized;
}

/**
 * Verify a Firebase ID token. Ensures the SDK is initialized first.
 * Throws if the SDK is not configured or the token is invalid — callers
 * (the auth middleware) translate that into a 401.
 * @param {string} idToken
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
async function verifyIdToken(idToken) {
  if (!initialized) {
    const result = initFirebaseAdmin();
    if (!result.ok) {
      throw new Error(`Firebase Admin not initialized: ${result.error}`);
    }
  }
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { admin, initFirebaseAdmin, isInitialized, verifyIdToken };
