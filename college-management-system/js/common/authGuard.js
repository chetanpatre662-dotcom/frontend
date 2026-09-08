/**
 * authGuard.js — Client-side route protection (UX layer only).
 * -----------------------------------------------------------------------------
 * Blocks rendering of protected pages until Firebase confirms an authenticated
 * user AND the backend confirms their DB role. If not authorized, redirects to
 * the appropriate page.
 *
 * IMPORTANT: This is a UX convenience, NOT a security boundary. A determined
 * user can bypass any client-side check. Real protection is enforced by the
 * Node.js backend which verifies the Firebase ID token on every request and
 * checks role/permission server-side. This guard provides defense-in-depth and
 * correct routing — it is not the sole security layer.
 *
 * resolveProfile() ALWAYS re-syncs from the backend so that a user whose role
 * was recently changed (e.g. promoted from student → admin) is routed to their
 * correct portal on the very next page load, without needing to log out first.
 * -----------------------------------------------------------------------------
 */
import {
  listenToAuthState,
  getSessionProfile,
  syncProfile,
} from '../services/authService.js';
import { ROUTES } from '../config.js';

/**
 * Wait for the first definitive Firebase auth state.
 * @returns {Promise<object|null>} identity or null
 */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = listenToAuthState((identity) => {
      unsub(); // we only need the first resolved state
      resolve(identity);
    });
  });
}

/**
 * Require an authenticated user before continuing. Redirects to loginUrl if not.
 * @param {string} loginUrl resolved URL to redirect unauthenticated users to
 * @returns {Promise<object|null>} identity if authenticated, else null (redirecting)
 */
export async function requireAuth(loginUrl) {
  const identity = await waitForAuth();
  if (!identity) {
    window.location.replace(loginUrl);
    return null;
  }
  return identity;
}

/**
 * Resolve the backend (PostgreSQL) profile for the current user. Always
 * performs a fresh backend sync to guarantee the role is current. This closes
 * the stale-cache bug where a user promoted from student→admin/faculty would
 * still see an old role from sessionStorage and be routed to the wrong portal.
 *
 * The backend independently re-verifies the Firebase ID token on every call, so
 * the session cache here is a latency optimisation only — it is never the
 * authoritative source for routing decisions. Bypassing it for the initial
 * "which portal am I?" check is safe and correct.
 *
 * Returns null if unauthenticated or the backend is unreachable.
 *
 * @returns {Promise<object|null>} fresh backend profile { id, firebaseUid, email, role, status, ... }
 */
export async function resolveProfile() {
  // Always sync fresh — do NOT use the cached value for role-routing decisions.
  // The cached value (if any) is updated as a side effect of syncProfile so
  // subsequent API calls still have a fast session-profile read.
  const res = await syncProfile(false); // false = reuse existing Firebase token (no force-refresh)
  if (res.ok && res.profile) return res.profile;

  // syncProfile failed (e.g. network error). Fall back to cached value only
  // so the user isn't logged out on a transient error. But log clearly.
  const cached = getSessionProfile();
  if (cached && cached.role && cached.status) {
    console.warn('[authGuard] resolveProfile: backend sync failed, using cached profile. Error:', res.error);
    return cached;
  }
  return null;
}

/**
 * Require an authenticated user whose DB role matches `expectedRole` AND whose
 * account status is 'approved'. Pending/rejected users are redirected to
 * `pendingUrl` (if supplied) instead of the login page.
 *
 * When the user IS authenticated but has a DIFFERENT approved role (e.g. an
 * admin who navigates to a student URL), they are redirected to their own
 * correct dashboard rather than to a login page — avoiding a confusing logout.
 *
 * @param {string} expectedRole 'student' | 'faculty' | 'admin'
 * @param {string} loginUrl resolved login URL for unauthenticated users
 * @param {string} [unauthorizedUrl] where to send role-mismatched users (defaults: their own dashboard)
 * @param {string} [pendingUrl] where to send pending/rejected users (defaults to loginUrl)
 * @returns {Promise<object|null>} the backend profile if authorized, else null
 */
export async function requireRole(expectedRole, loginUrl, unauthorizedUrl, pendingUrl) {
  const identity = await waitForAuth();
  if (!identity) {
    window.location.replace(loginUrl);
    return null;
  }

  const profile = await resolveProfile();

  // No profile at all → unauthenticated at the application level.
  if (!profile) {
    window.location.replace(loginUrl);
    return null;
  }

  // Wrong role: redirect to the user's own correct dashboard (not to a login page).
  if (profile.role !== expectedRole) {
    // If an explicit unauthorizedUrl is given, use it. Otherwise derive the
    // correct dashboard from the user's actual DB role so they land somewhere useful.
    const correctDash = unauthorizedUrl || _dashboardForRole(profile.role, loginUrl);
    window.location.replace(correctDash);
    return null;
  }

  // Correct role but pending/rejected — redirect to the pending screen.
  if (expectedRole !== 'student' && profile.status && profile.status !== 'approved') {
    window.location.replace(pendingUrl || loginUrl);
    return null;
  }

  return profile;
}

/**
 * Map a DB role to its dashboard path using the canonical ROUTES from config.js.
 * Falls back to `fallback` when the role is unknown.
 * @private
 */
function _dashboardForRole(role, fallback) {
  const map = {
    admin:   ROUTES.ADMIN.DASHBOARD,
    faculty: ROUTES.FACULTY.DASHBOARD,
    student: ROUTES.STUDENT.DASHBOARD,
  };
  return map[role] || fallback;
}
