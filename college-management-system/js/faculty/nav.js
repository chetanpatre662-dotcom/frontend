/**
 * faculty/nav.js — Faculty sidebar config + shared page bootstrap.
 * Guards the route, mounts the shell, returns { main, session }.
 */
import { ROUTES, resolvePath } from '../config.js';
import { requireAuth } from '../common/authGuard.js';
import { mountLayout } from '../common/layout.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: ROUTES.FACULTY.DASHBOARD },
  { id: 'ai', label: 'AI Assistant', icon: 'sparkles', href: ROUTES.FACULTY.AI, ai: true },
  { section: 'Teaching' },
  { id: 'classes', label: 'My Classes', icon: 'classes', href: ROUTES.FACULTY.CLASSES },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone', href: ROUTES.FACULTY.ANNOUNCEMENTS },
  { id: 'papers', label: 'Question Papers', icon: 'file', href: ROUTES.FACULTY.QUESTION_PAPERS },
  { id: 'events', label: 'Events', icon: 'calendar', href: ROUTES.FACULTY.EVENTS },
];

/**
 * Gate the page on Firebase auth state, then mount the shell.
 * Returns null (after redirecting) if the visitor is not authenticated.
 * @returns {Promise<{main:HTMLElement, user:object}|null>}
 */
export async function bootstrapFaculty({ activeId, title }) {
  const loginUrl = resolvePath(ROUTES.FACULTY.LOGIN);
  const user = await requireAuth(loginUrl);
  if (!user) return null; // redirected — not authenticated

  const main = mountLayout({
    roleClass: 'role-faculty',
    roleLabel: 'Faculty Portal',
    nav: NAV,
    activeId,
    loginUrl,
    title,
    user,
  });
  return { main, user };
}
