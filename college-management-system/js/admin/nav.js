/**
 * admin/nav.js — Admin sidebar config + shared page bootstrap.
 */
import { ROUTES, resolvePath } from '../config.js';
import { requireRole } from '../common/authGuard.js';
import { mountLayout } from '../common/layout.js';

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: 'dashboard', href: ROUTES.ADMIN.DASHBOARD },
  { id: 'ai', label: 'AI Assistant', icon: 'sparkles', href: ROUTES.ADMIN.AI, ai: true },
  { section: 'Manage' },
  { id: 'students', label: 'Students', icon: 'graduation', href: ROUTES.ADMIN.STUDENTS },
  { id: 'faculty', label: 'Faculty', icon: 'user', href: ROUTES.ADMIN.FACULTY },
  { id: 'management', label: 'Admins', icon: 'shield', href: ROUTES.ADMIN.MANAGEMENT },
  { id: 'classes', label: 'Classes', icon: 'classes', href: ROUTES.ADMIN.CLASSES },
  { id: 'courses', label: 'Courses', icon: 'book', href: ROUTES.ADMIN.COURSES },
];

const FOOT_NAV = [
  { id: 'settings', label: 'Settings', icon: 'settings', href: ROUTES.ADMIN.SETTINGS },
];

/**
 * Admin pages are protected by the DB-backed role (server source of truth), NOT
 * mere Firebase authentication. requireRole('admin', ...) redirects:
 *   - unauthenticated users -> admin login
 *   - authenticated non-admins (student/faculty) -> admin login (access denied)
 * The backend independently re-verifies the Firebase token + role on every API
 * request, so this guard is defense-in-depth, not the sole security boundary.
 *
 * @returns {Promise<{main:HTMLElement, user:object}|null>}
 */
export async function bootstrapAdmin({ activeId, title }) {
  const loginUrl = resolvePath(ROUTES.ADMIN.LOGIN);
  // Verified PostgreSQL profile { id, firebaseUid, email, displayName, role }.
  const profile = await requireRole('admin', loginUrl);
  if (!profile) return null;

  // Normalize to the shape the layout/dashboards expect (they read `user.name`).
  const user = {
    ...profile,
    name: profile.displayName || (profile.email ? profile.email.split('@')[0] : 'Administrator'),
  };

  const main = mountLayout({
    roleClass: 'role-admin',
    roleLabel: 'Administration',
    nav: NAV,
    footNav: FOOT_NAV,
    activeId,
    loginUrl,
    title,
    user,
  });
  return { main, user };
}
