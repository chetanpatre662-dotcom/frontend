/**
 * student/nav.js — Student sidebar config + shared page bootstrap.
 */
import { ROUTES, resolvePath } from '../config.js';
import { requireRole } from '../common/authGuard.js';
import { mountLayout } from '../common/layout.js';

const NAV = [
  { id: 'dashboard', label: 'Home & Assistant', icon: 'sparkles', href: ROUTES.STUDENT.DASHBOARD, ai: true },
  { section: 'Academics' },
  { id: 'classes', label: 'My Classes', icon: 'classes', href: ROUTES.STUDENT.CLASSES },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone', href: ROUTES.STUDENT.ANNOUNCEMENTS },
  { id: 'papers', label: 'Question Papers', icon: 'file', href: ROUTES.STUDENT.QUESTION_PAPERS },
  { id: 'events', label: 'Events', icon: 'calendar', href: ROUTES.STUDENT.EVENTS },
  { section: 'Account' },
  { id: 'profile', label: 'My Profile', icon: 'user', href: ROUTES.STUDENT.PROFILE },
];

/**
 * Student pages are protected by the DB-backed role (server source of truth),
 * NOT mere Firebase authentication. requireRole('student', ...) ensures:
 *   - unauthenticated users          → student login
 *   - authenticated non-students     → their own correct dashboard
 *                                       (admin → admin dash, faculty → faculty dash)
 * This closes the bug where an admin visiting a /student/ URL would be let in
 * because the old guard only checked "are you logged in".
 *
 * Note: students do not have a pending/rejected approval gate — any authenticated
 * user with role='student' is allowed. The `pendingUrl` param is omitted.
 *
 * @returns {Promise<{main:HTMLElement, user:object}|null>}
 */
export async function bootstrapStudent({ activeId, title }) {
  const loginUrl = resolvePath(ROUTES.STUDENT.LOGIN);
  // requireRole redirects non-students to their correct dashboard automatically
  // (see authGuard._dashboardForRole). No explicit unauthorizedUrl needed.
  const profile = await requireRole('student', loginUrl);
  if (!profile) return null;

  // Normalize to the shape the layout/dashboards expect (they read `user.name`).
  const user = {
    ...profile,
    name: profile.displayName || (profile.email ? profile.email.split('@')[0] : 'Student'),
  };

  const main = mountLayout({
    roleClass: 'role-student',
    roleLabel: 'Student Portal',
    nav: NAV,
    activeId,
    loginUrl,
    title,
    user,
  });
  return { main, user };
}
