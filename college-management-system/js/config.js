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
  COLLEGE_NAME: 'Meridian Institute of Engineering & Technology',
  COLLEGE_SHORT: 'MIET',
  VERSION: '1.0.0-frontend',
};

/**
 * Future backend integration seam.
 * USE_MOCK = true keeps everything running on local mock data.
 * Flip to false (and implement apiClient) when the real API is ready.
 */
export const ENV = {
  USE_MOCK: true,
  // Absolute base URL of the Node.js/Express backend. The static frontend is
  // typically served from a different origin/port (e.g. 5500/8000) than the
  // backend (5000), so this must be absolute for cross-origin API calls.
  API_BASE_URL: 'http://localhost:5000/api',
  // Auth/profile sync uses the REAL backend even while other services stay on
  // mock data. This is intentionally separate from USE_MOCK so wiring auth to
  // PostgreSQL does not disturb the unrelated mock services (classes, notes…).
  AUTH_USE_BACKEND: true,
  WS_URL: '', // placeholder — websocketService will use this later
  SIMULATED_LATENCY_MS: 350, // makes loading states visible/realistic
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
 * DEMO content ownership (design/demo only — NOT authentication).
 * The seed classes/announcements/papers in mockData.js are owned by this demo
 * faculty id, and the demo student profile below scopes the student views.
 *
 * These values are NOT credentials and are NOT tied to any real user identity.
 * Firebase Authentication supplies the real identity (uid/email/name). Once the
 * Node.js + PostgreSQL backend exists, real per-user profiles (keyed by Firebase
 * UID) replace these demo attributes and this block can be deleted.
 */
export const DEMO_CONTENT = {
  FACULTY_OWNER_ID: 'FAC1001', // owner of the seed content in mockData.js
  STUDENT_PROFILE: { course: 'B.Tech', branch: 'Computer Science', semester: 3, roll: 'CSE-B3-014' },
};

/** localStorage keys — used to persist mock state across pages. */
export const STORAGE_KEYS = {
  SESSION: 'cms.session',
  CLASSES: 'cms.classes',
  ANNOUNCEMENTS: 'cms.announcements',
  QUESTION_PAPERS: 'cms.questionPapers',
  FACULTY: 'cms.faculty',
  STUDENTS: 'cms.students',
  NOTES: 'cms.notes',
  MESSAGES: 'cms.messages',
  AI_CHATS: 'cms.aiChats',
  EVENTS: 'cms.events',
};

/** Event categories/types (used by faculty Add Event + student filter). */
export const EVENT_TYPES = ['Workshop', 'Seminar', 'Cultural', 'Sports', 'Exam'];

/** Route map keeps navigation consistent and easy to refactor. */
export const ROUTES = {
  HOME: '/index.html',
  FACULTY: {
    LOGIN: '/faculty/login.html',
    DASHBOARD: '/faculty/dashboard.html',
    CLASSES: '/faculty/classes.html',
    CLASS_DETAIL: '/faculty/class.html',
    ANNOUNCEMENTS: '/faculty/announcements.html',
    QUESTION_PAPERS: '/faculty/question-papers.html',
    EVENTS: '/faculty/events.html',
    AI: '/faculty/assistant.html',
  },
  STUDENT: {
    LOGIN: '/student/login.html',
    DASHBOARD: '/student/dashboard.html',
    CLASSES: '/student/classes.html',
    CLASS_DETAIL: '/student/class.html',
    ANNOUNCEMENTS: '/student/announcements.html',
    QUESTION_PAPERS: '/student/question-papers.html',
    EVENTS: '/student/events.html',
    AI: '/student/assistant.html',
  },
  ADMIN: {
    LOGIN: '/admin/login.html',
    DASHBOARD: '/admin/dashboard.html',
    FACULTY: '/admin/faculty.html',
    STUDENTS: '/admin/students.html',
    CLASSES: '/admin/classes.html',
    COURSES: '/admin/courses.html',
    SETTINGS: '/admin/settings.html',
    AI: '/admin/assistant.html',
  },
};

/**
 * Resolve an app-root-relative path (starting with "/") to a path that works
 * regardless of how deep the current page is nested (e.g. /faculty/x.html).
 * Keeps links robust without a server rewrite layer.
 */
export function resolvePath(rootRelative) {
  // Determine how many levels deep we are relative to the app root.
  // The app root is the folder that contains index.html.
  const path = window.location.pathname;
  const marker = '/college-management-system/';
  let base = '';
  if (path.includes(marker)) {
    base = path.substring(0, path.indexOf(marker) + marker.length - 1);
  } else {
    // Fallback: assume the folder holding index.html is the app root.
    // Strip the trailing file + one folder if we're inside faculty/student/admin.
    const segments = path.split('/').filter(Boolean);
    segments.pop(); // remove file name
    if (['faculty', 'student', 'admin'].includes(segments[segments.length - 1])) {
      segments.pop();
    }
    base = '/' + segments.join('/');
  }
  return (base + rootRelative).replace(/\/{2,}/g, '/');
}
