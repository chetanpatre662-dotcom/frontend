/**
 * firebase/auth.js
 * -----------------------------------------------------------------------------
 * Thin wrapper around the Firebase Authentication SDK.
 *
 * This module is the ONLY place that imports Firebase Auth SDK functions.
 * The rest of the app talks to services/authService.js, which in turn calls
 * these helpers. Keeping the SDK isolated here means:
 *   - UI code never touches Firebase directly.
 *   - Swapping SDK versions or adding providers happens in one file.
 *
 * No user identities, UIDs, emails or passwords are stored here. Firebase
 * Authentication is the source of truth for identity; every UID is generated
 * by Firebase and read back dynamically via the returned user objects.
 * -----------------------------------------------------------------------------
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import { auth, googleProvider, isFirebaseConfigured } from './firebase-config.js';

export { auth, isFirebaseConfigured };

/**
 * Choose how long the session survives.
 * remember=true  -> persists across browser restarts (local persistence)
 * remember=false -> cleared when the tab/window closes (session persistence)
 */
export async function applyPersistence(remember) {
  await setPersistence(
    auth,
    remember ? browserLocalPersistence : browserSessionPersistence
  );
}

export function createEmailUser(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInEmailUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function setDisplayName(user, displayName) {
  return updateProfile(user, { displayName });
}

/**
 * Get a Firebase ID token for the currently authenticated user.
 * Returns null if no user is signed in. Firebase refreshes the token
 * automatically when needed; pass forceRefresh=true to force a new one.
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string|null>}
 */
export async function getIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/**
 * Subscribe to Firebase auth state changes.
 * @param {(user: import('firebase/auth').User|null) => void} callback
 * @returns {Function} unsubscribe
 */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
