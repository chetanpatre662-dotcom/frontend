/**
 * config.js
 * Central application configuration and domain constants.
 * Single source of truth for course types, branches, semesters and app settings.
 *
 * NOTE (security): No secrets, API keys, or credentials belong in frontend files.
 * When the backend is added, only the BASE_URL / endpoints below change.
 */

export const APP = {
  NAME: 'College Management System',
  SHORT_NAME: 'CMS',
  COLLEGE_NAME: 'Askbook',
  COLLEGE_SHORT: 'Askbook',
  // Full institution name (used in footers/meta).
  COLLEGE_FULL: 'Satpuda College of Engineering and Polytechnic',
  // Sub-brand / co-brand tag rendered as a refined badge next to the name.
  COLLEGE_SUB: 'SCEP',
  // Local Askbook logo asset (app-root-relative; use resolvePath() for links).
  COLLEGE_LOGO: './assets/logos/askbook.png',
  VERSION: '1.0.0-frontend',
};

/**
 * Backend configuration. The app is fully backed by the real Node.js/Express +
 * PostgreSQL backend (no mock data). AUTH_USE_BACKEND gates all authenticated
 * API calls; the static frontend is typically served from a different origin
 * than the backend, so API_BASE_URL must be absolute for cross-origin calls.
 */
export const ENV = {
  API_BASE_URL: '/askbook-api',
  AUTH_USE_BACKEND: true,
  WS_URL: '/askbook-ws', // empty -> realtimeService derives ws(s)://host/ws from API_BASE_URL
};

export const ROLES = {
  FACULTY: 'faculty',
  STUDENT: 'student',
  ADMIN: 'admin',
};

export const COURSE_TYPES = {
  POLYTECHNIC: 'Polytechnic',
  BTECH: 'B.Tech',
};

export const BRANCHES = [
  'Computer Science',
  'Mining',
  'Electrical',
  'Civil',
  'Mechanical',
];

/**
 * Semester structure differs per course type.
 * Polytechnic: 3 years, 6 semesters, grouped by year.
 * B.Tech: 4 years, 8 semesters.
 */
export const SEMESTER_STRUCTURE = {
  [COURSE_TYPES.POLYTECHNIC]: {
    totalSemesters: 6,
    years: [
      { year: '1st Year', semesters: [1, 2] },
      { year: '2nd Year', semesters: [3, 4] },
      { year: '3rd Year', semesters: [5, 6] },
    ],
  },
  [COURSE_TYPES.BTECH]: {
    totalSemesters: 8,
    years: [
      { year: '1st Year', semesters: [1, 2] },
      { year: '2nd Year', semesters: [3, 4] },
      { year: '3rd Year', semesters: [5, 6] },
      { year: '4th Year', semesters: [7, 8] },
    ],
  },
};

/**
 * Faculty departments — same set as academic BRANCHES for this college.
 * Kept as its own export so intent is clear at faculty-registration call sites.
 */
export const DEPARTMENTS = [...BRANCHES];

/**
 * Faculty designations. Mirrors the options already used in the admin faculty
 * form (Assistant/Associate/Professor) plus the additional roles requested.
 */
export const DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'HOD',
  'Lecturer',
  'Lab Instructor',
];

/**
 * Year options for a given course/program, derived from SEMESTER_STRUCTURE.
 * @param {string} program COURSE_TYPES value
 * @returns {{label:string, semesters:number[]}[]}
 */
export function yearsForProgram(program) {
  const struct = SEMESTER_STRUCTURE[program];
  if (!struct) return [];
  return struct.years.map((y) => ({ label: y.year, semesters: y.semesters }));
}

/**
 * Semesters available for a given program + year label.
 * @returns {number[]}
 */
export function semestersForYear(program, yearLabel) {
  const struct = SEMESTER_STRUCTURE[program];
  if (!struct) return [];
  const entry = struct.years.find((y) => y.year === yearLabel);
  return entry ? entry.semesters.slice() : [];
}

/**
 * Derive the academic year label from a program + semester (year is NOT stored;
 * it is always derived from the authoritative semester).
 * @returns {string|null}
 */
export function yearFromSemester(program, semester) {
  const struct = SEMESTER_STRUCTURE[program];
  if (!struct) return null;
  const sem = Number(semester);
  const entry = struct.years.find((y) => y.semesters.includes(sem));
  return entry ? entry.year : null;
}

/**
 * Validate that a program + semester combination is legal
 * (B.Tech: 1–8, Polytechnic: 1–6).
 * @returns {boolean}
 */
export function isValidProgramSemester(program, semester) {
  const struct = SEMESTER_STRUCTURE[program];
  if (!struct) return false;
  const sem = Number(semester);
  return Number.isInteger(sem) && sem >= 1 && sem <= struct.totalSemesters;
}

export const ANNOUNCEMENT_TYPES = [
  'General',
  'Event',
  'Holiday',
  'Exam',
  'Important Notice',
];

export const TARGET_AUDIENCES = [
  'All Students',
  'B.Tech',
  'Polytechnic',
  'Specific Branch',
  'Specific Semester',
];

/**
 * Storage keys for ALLOWED client-side caches only (NOT business data):
 *   SESSION  — cached verified backend profile (auth convenience; re-verified
 *              server-side on every request).
 *   AI_CHATS — local AI assistant chat threads (scoped per Firebase UID).
 * Business data (classes/notes/papers/announcements/messages/notifications) is
 * NEVER stored client-side; it lives in PostgreSQL and is fetched from the API.
 */
export const STORAGE_KEYS = {
  SESSION: 'cms.session',
  AI_CHATS: 'cms.aiChats',
};

/** Event categories/types (used by faculty Add Event + student filter). */
export const EVENT_TYPES = ['Workshop', 'Seminar', 'Cultural', 'Sports', 'Exam'];

/** Route map keeps navigation consistent and easy to refactor. */
const APP_BASE = '/askbook';

export const ROUTES = {
  HOME: `${APP_BASE}/index.html`,

  FACULTY: {
    LOGIN: `${APP_BASE}/faculty/login.html`,
    DASHBOARD: `${APP_BASE}/faculty/dashboard.html`,
    CLASSES: `${APP_BASE}/faculty/classes.html`,
    CLASS_DETAIL: `${APP_BASE}/faculty/class.html`,
    ANNOUNCEMENTS: `${APP_BASE}/faculty/announcements.html`,
    QUESTION_PAPERS: `${APP_BASE}/faculty/question-papers.html`,
    EVENTS: `${APP_BASE}/faculty/events.html`,
    AI: `${APP_BASE}/faculty/assistant.html`,
    PROFILE: `${APP_BASE}/faculty/profile.html`,
  },

  STUDENT: {
    LOGIN: `${APP_BASE}/student/login.html`,
    DASHBOARD: `${APP_BASE}/student/dashboard.html`,
    CLASSES: `${APP_BASE}/student/classes.html`,
    CLASS_DETAIL: `${APP_BASE}/student/class.html`,
    ANNOUNCEMENTS: `${APP_BASE}/student/announcements.html`,
    QUESTION_PAPERS: `${APP_BASE}/student/question-papers.html`,
    EVENTS: `${APP_BASE}/student/events.html`,
    AI: `${APP_BASE}/student/assistant.html`,
    PROFILE: `${APP_BASE}/student/profile.html`,
  },

  ADMIN: {
    LOGIN: `${APP_BASE}/admin/login.html`,
    DASHBOARD: `${APP_BASE}/admin/dashboard.html`,
    FACULTY: `${APP_BASE}/admin/faculty.html`,
    STUDENTS: `${APP_BASE}/admin/students.html`,
    MANAGEMENT: `${APP_BASE}/admin/management.html`,
    REQUESTS: `${APP_BASE}/admin/requests.html`,
    CLASSES: `${APP_BASE}/admin/classes.html`,
    COURSES: `${APP_BASE}/admin/courses.html`,
    SETTINGS: `${APP_BASE}/admin/settings.html`,
    AI: `${APP_BASE}/admin/assistant.html`,
    AI_DOCUMENTS: `${APP_BASE}/admin/ai-documents.html`,
    PROFILE: `${APP_BASE}/admin/profile.html`,
  },
};

/**
 * Resolve a path for use in navigation links and redirects.
 * ROUTES values already contain the full absolute path including the
 * /askbook base prefix, so no additional computation is needed.
 */
export function resolvePath(rootRelative) {
  return rootRelative;
}
