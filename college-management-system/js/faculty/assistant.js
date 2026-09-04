/**
 * faculty/assistant.js — Faculty AI Assistant page.
 */
import { DEMO_CONTENT } from '../config.js';
import { bootstrapFaculty } from './nav.js';
import { renderAssistant } from '../common/aiAssistant.js';

bootstrapFaculty({ activeId: 'ai', title: 'AI Assistant' }).then((ctx) => {
  if (!ctx) return;
  renderAssistant({
    main: ctx.main,
    user: ctx.user,
    role: 'faculty',
    profile: { facultyId: DEMO_CONTENT.FACULTY_OWNER_ID },
  });
});
