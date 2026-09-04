/**
 * student/class.js — Class detail (read-only for students).
 */
import { ROUTES, resolvePath, DEMO_CONTENT } from '../config.js';
import { bootstrapStudent } from './nav.js';
import { renderClassDetail } from '../common/classDetail.js';

bootstrapStudent({ activeId: 'classes', title: 'Class' }).then((ctx) => {
  if (!ctx) return;
  const user = { ...DEMO_CONTENT.STUDENT_PROFILE, ...ctx.user };
  renderClassDetail({
    main: ctx.main,
    user,
    role: 'student',
    backUrl: resolvePath(ROUTES.STUDENT.CLASSES),
    canManage: false, // students never post/upload — read-only
  });
});
