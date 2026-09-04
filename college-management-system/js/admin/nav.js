/**
 * admin/nav.js — Admin sidebar config + shared page bootstrap.
 */
import { ROUTES, resolvePath } from '../config.js';
import { requireAuth } from '../common/authGuard.js';
import { mountLayout } from '../common/layout.js';

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: 'dashboard', href: ROUTES.ADMIN.DASHBOARD },
  { id: 'ai', label: 'AI Assistant', icon: 'sparkles', href: ROUTES.ADMIN.AI, ai: true },
  { section: 'Manage' },
  { id: 'students', label: 'Students', icon: 'graduation', href: ROUTES.ADMIN.STUDENTS },
  { id: 'faculty', label: 'Faculty', icon: 'user', href: ROUTES.ADMIN.FACULTY },
  { id: 'classes', label: 'Classes', icon: 'classes', href: ROUTES.ADMIN.CLASSES },
  { id: 'courses', label: 'Courses', icon: 'book', href: ROUTES.ADMIN.COURSES },
];

const FOOT_NAV = [
  { id: 'settings', label: 'Settings', icon: 'settings', href: ROUTES.ADMIN.SETTINGS },
];

/** @returns {Promise<{main:HTMLElement, user:object}|null>} */
export async function bootstrapAdmin({ activeId, title }) {
  const loginUrl = resolvePath(ROUTES.ADMIN.LOGIN);
  const user = await requireAuth(loginUrl);
  if (!user) return null;

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
