/**
 * student/assistant.js — Student AI Assistant page.
 */
import { DEMO_CONTENT } from '../config.js';
import { bootstrapStudent } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';

bootstrapStudent({ activeId: 'ai', title: 'AI Assistant' }).then((ctx) => {
  if (!ctx) return;
  const user = { ...DEMO_CONTENT.STUDENT_PROFILE, ...ctx.user };
  const profile = {
    program: user.program || user.course,
    course: user.program || user.course,
    branch: user.branch,
    semester: user.semester,
  };
  renderAssistant({ main: ctx.main, user, role: 'student', profile });
});
