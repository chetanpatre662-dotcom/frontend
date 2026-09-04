/**
 * mockData.js — Seed datasets for the frontend-only phase.
 * All data lives here (not in HTML). Services read/write these seeds via a
 * localStorage-backed store so state persists across page navigations.
 *
 * When the backend arrives, services swap these seeds for API responses;
 * this file can be deleted without touching UI code.
 */

export const mockFaculty = [
  { id: 'FAC1001', name: 'Dr. Anita Sharma', email: 'anita.sharma@miet.edu', department: 'Computer Science', designation: 'Associate Professor', phone: '+91 98110 22114', status: 'active', joined: '2018-07-12' },
  { id: 'FAC1002', name: 'Prof. Rajesh Verma', email: 'rajesh.verma@miet.edu', department: 'Electrical', designation: 'Professor', phone: '+91 98110 55231', status: 'active', joined: '2015-01-05' },
  { id: 'FAC1003', name: 'Dr. Meera Nair', email: 'meera.nair@miet.edu', department: 'Civil', designation: 'Assistant Professor', phone: '+91 98110 77812', status: 'active', joined: '2020-08-20' },
  { id: 'FAC1004', name: 'Prof. Sundeep Rao', email: 'sundeep.rao@miet.edu', department: 'Mechanical', designation: 'Associate Professor', phone: '+91 98110 33119', status: 'inactive', joined: '2016-03-11' },
  { id: 'FAC1005', name: 'Dr. Farah Khan', email: 'farah.khan@miet.edu', department: 'Mining', designation: 'Professor', phone: '+91 98110 66540', status: 'active', joined: '2013-06-01' },
  { id: 'FAC1006', name: 'Prof. Vikram Singh', email: 'vikram.singh@miet.edu', department: 'Computer Science', designation: 'Assistant Professor', phone: '+91 98110 90087', status: 'active', joined: '2021-09-15' },
];

export const mockStudents = [
  { id: 'STU2201', name: 'Rahul Deshmukh', roll: 'CSE-B3-014', email: 'rahul.d@miet.edu', course: 'B.Tech', branch: 'Computer Science', semester: 3, status: 'active' },
  { id: 'STU2202', name: 'Priya Menon', roll: 'CSE-B3-015', email: 'priya.m@miet.edu', course: 'B.Tech', branch: 'Computer Science', semester: 3, status: 'active' },
  { id: 'STU2203', name: 'Aman Gupta', roll: 'MIN-B5-002', email: 'aman.g@miet.edu', course: 'B.Tech', branch: 'Mining', semester: 5, status: 'active' },
  { id: 'STU2204', name: 'Sneha Iyer', roll: 'CIV-P2-021', email: 'sneha.i@miet.edu', course: 'Polytechnic', branch: 'Civil', semester: 2, status: 'active' },
  { id: 'STU2205', name: 'Karan Malhotra', roll: 'ELE-B7-009', email: 'karan.m@miet.edu', course: 'B.Tech', branch: 'Electrical', semester: 7, status: 'inactive' },
  { id: 'STU2206', name: 'Divya Reddy', roll: 'MEC-P4-013', email: 'divya.r@miet.edu', course: 'Polytechnic', branch: 'Mechanical', semester: 4, status: 'active' },
  { id: 'STU2207', name: 'Arjun Nair', roll: 'CSE-B3-016', email: 'arjun.n@miet.edu', course: 'B.Tech', branch: 'Computer Science', semester: 3, status: 'active' },
  { id: 'STU2208', name: 'Ishita Bose', roll: 'MIN-B5-003', email: 'ishita.b@miet.edu', course: 'B.Tech', branch: 'Mining', semester: 5, status: 'active' },
];

/*
 * Class record shape (frontend model, ready for a future PostgreSQL table):
 *   id, facultyId, facultyName, courseName (subject), program (=course, kept for
 *   backward-compat with announcement/question-paper filters), branch, semester,
 *   description, students (count), status, created.
 *
 * NOTE: `course` is intentionally kept alongside `program` so existing filters
 * (announcements/question papers) that read `.course` keep working unchanged.
 * `program` is the structured academic field used by automatic class matching.
 */
export const mockClasses = [
  { id: 'CLS3001', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', courseName: 'Data Structures', course: 'B.Tech', program: 'B.Tech', branch: 'Computer Science', semester: 3, description: 'Core data structures: arrays, linked lists, trees, graphs, hashing and complexity analysis.', students: 58, status: 'active', created: '2025-07-20' },
  { id: 'CLS3002', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', courseName: 'Mine Surveying', course: 'B.Tech', program: 'B.Tech', branch: 'Mining', semester: 5, description: 'Principles of mine surveying, levelling, and underground measurement techniques.', students: 42, status: 'active', created: '2025-07-22' },
  { id: 'CLS3003', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', courseName: 'Structural Analysis', course: 'Polytechnic', program: 'Polytechnic', branch: 'Civil', semester: 2, description: 'Analysis of determinate structures, beams, trusses and load distribution.', students: 36, status: 'active', created: '2025-08-01' },
  { id: 'CLS3004', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', courseName: 'Power Systems', course: 'B.Tech', program: 'B.Tech', branch: 'Electrical', semester: 7, description: 'Generation, transmission and distribution of electrical power.', students: 40, status: 'archived', created: '2025-01-15' },
];

/*
 * Class messages — a faculty member posts to a class; matching students see them.
 * Shape: { id, classId, facultyId, facultyName, body, attachment, created, unread }
 * Future: stored in PostgreSQL; delivered live via WebSocket to class members.
 */
export const mockMessages = [
  { id: 'MSG1', classId: 'CLS3001', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', body: 'Tomorrow\'s Data Structures lab will start at 10 AM sharp in Lab 3. Bring your assignment files.', attachment: null, created: '2025-09-02T09:15:00Z', unread: true },
  { id: 'MSG2', classId: 'CLS3001', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', body: 'Uploaded the Unit 2 (Trees) notes. Please review before the next lecture.', attachment: null, created: '2025-09-01T14:40:00Z', unread: true },
  { id: 'MSG3', classId: 'CLS3001', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', body: 'Reminder: the graph algorithms quiz is scheduled for Friday.', attachment: null, created: '2025-08-30T11:00:00Z', unread: false },
  { id: 'MSG4', classId: 'CLS3002', facultyId: 'FAC1001', facultyName: 'Dr. Anita Sharma', body: 'Field survey practical rescheduled to next Monday due to weather.', attachment: null, created: '2025-08-29T08:30:00Z', unread: false },
];

/*
 * Class notes — faculty upload study material to a class.
 * Shape: { id, classId, title, description, fileName, storagePath, uploadedBy,
 *          uploadedByName, created }
 * Future: file bytes in Firebase Cloud Storage; only metadata + storagePath in DB.
 */
export const mockNotes = [
  { id: 'NOTE1', classId: 'CLS3001', title: 'Unit 1 — Arrays & Linked Lists', description: 'Introduction, operations, and complexity.', fileName: 'ds_unit1.pdf', storagePath: 'classes/CLS3001/notes/ds_unit1.pdf', uploadedBy: 'FAC1001', uploadedByName: 'Dr. Anita Sharma', created: '2025-08-20' },
  { id: 'NOTE2', classId: 'CLS3001', title: 'Unit 2 — Trees', description: 'Binary trees, BST, traversals, balancing.', fileName: 'ds_unit2_trees.pdf', storagePath: 'classes/CLS3001/notes/ds_unit2_trees.pdf', uploadedBy: 'FAC1001', uploadedByName: 'Dr. Anita Sharma', created: '2025-09-01' },
  { id: 'NOTE3', classId: 'CLS3001', title: 'Lecture Slides — Hashing', description: 'Hash functions, collision resolution.', fileName: 'ds_hashing.pdf', storagePath: 'classes/CLS3001/notes/ds_hashing.pdf', uploadedBy: 'FAC1001', uploadedByName: 'Dr. Anita Sharma', created: '2025-09-03' },
  { id: 'NOTE4', classId: 'CLS3002', title: 'Levelling Techniques', description: 'Differential and profile levelling.', fileName: 'mine_levelling.pdf', storagePath: 'classes/CLS3002/notes/mine_levelling.pdf', uploadedBy: 'FAC1001', uploadedByName: 'Dr. Anita Sharma', created: '2025-08-25' },
];

export const mockAnnouncements = [
  { id: 'ANN4001', facultyId: 'FAC1001', title: 'Mid-Semester Exam Schedule Released', type: 'Exam', description: 'The mid-semester examination for Semester 3 begins on 22 September. Detailed datesheet is attached. Please report 15 minutes before each exam.', audience: 'Specific Semester', course: 'B.Tech', branch: 'Computer Science', semester: 3, eventDate: '2025-09-22', attachment: 'datesheet_sem3.pdf', status: 'published', created: '2025-09-01T09:30:00Z' },
  { id: 'ANN4002', facultyId: 'FAC1001', title: 'Guest Lecture on Cloud Architecture', type: 'Event', description: 'A guest lecture by industry experts on modern cloud architecture patterns. Open to all B.Tech CSE students.', audience: 'Specific Branch', course: 'B.Tech', branch: 'Computer Science', semester: null, eventDate: '2025-09-10', attachment: null, status: 'published', created: '2025-08-28T14:00:00Z' },
  { id: 'ANN4003', facultyId: 'FAC1001', title: 'Independence Day Holiday', type: 'Holiday', description: 'The institute will remain closed on 15 August in observance of Independence Day.', audience: 'All Students', course: null, branch: null, semester: null, eventDate: '2025-08-15', attachment: null, status: 'published', created: '2025-08-10T08:00:00Z' },
  { id: 'ANN4004', facultyId: 'FAC1001', title: 'Lab Assignment Submission Reminder', type: 'Important Notice', description: 'All pending Data Structures lab assignments must be submitted by end of this week.', audience: 'Specific Semester', course: 'B.Tech', branch: 'Computer Science', semester: 3, eventDate: null, attachment: null, status: 'draft', created: '2025-09-02T11:15:00Z' },
];

export const mockQuestionPapers = [
  { id: 'QP5001', facultyId: 'FAC1001', title: 'Data Structures — End Sem', course: 'B.Tech', branch: 'Computer Science', semester: 3, subject: 'Data Structures', year: '2024', file: 'ds_endsem_2024.pdf', uploaded: '2025-07-25' },
  { id: 'QP5002', facultyId: 'FAC1001', title: 'Data Structures — Mid Sem', course: 'B.Tech', branch: 'Computer Science', semester: 3, subject: 'Data Structures', year: '2023', file: 'ds_midsem_2023.pdf', uploaded: '2025-07-25' },
  { id: 'QP5003', facultyId: 'FAC1001', title: 'Mine Surveying — End Sem', course: 'B.Tech', branch: 'Mining', semester: 5, subject: 'Mine Surveying', year: '2024', file: 'mine_survey_2024.pdf', uploaded: '2025-08-02' },
  { id: 'QP5004', facultyId: 'FAC1001', title: 'Structural Analysis — End Sem', course: 'Polytechnic', branch: 'Civil', semester: 2, subject: 'Structural Analysis', year: '2024', file: 'struct_2024.pdf', uploaded: '2025-08-05' },
];

export const mockNotifications = [
  { id: 'NT1', icon: 'megaphone', title: 'New announcement published to CSE Sem 3', time: '2025-09-02T11:20:00Z', unread: true },
  { id: 'NT2', icon: 'file', title: 'Question paper uploaded: Data Structures 2024', time: '2025-09-01T16:40:00Z', unread: true },
  { id: 'NT3', icon: 'users', title: '3 new students enrolled in Mining Sem 5', time: '2025-08-30T09:10:00Z', unread: false },
  { id: 'NT4', icon: 'calendar', title: 'Reminder: Mid-sem exams start 22 Sep', time: '2025-08-29T08:00:00Z', unread: false },
];

/*
 * Events (institute-wide). Faculty create/manage; students browse a showcase.
 * Shape: { id, title, type, datetime(ISO), venue, description, banner(fileName),
 *          brochure(fileName), createdBy, createdByName, status, created }
 * `banner`/`brochure` are filenames only (real files → Firebase Storage later).
 */
export const mockEvents = [
  { id: 'EVT7001', title: 'National Workshop on Cloud & DevOps', type: 'Workshop', datetime: '2026-09-20T10:00:00', venue: 'Seminar Hall A', description: 'Hands-on workshop covering containerization, CI/CD pipelines and cloud deployment with industry mentors.', banner: 'cloud_devops_banner.jpg', brochure: 'cloud_devops_brochure.pdf', createdBy: 'FAC1001', createdByName: 'Dr. Anita Sharma', status: 'active', created: '2026-08-15' },
  { id: 'EVT7002', title: 'Annual Cultural Fest — Meridian Utsav', type: 'Cultural', datetime: '2026-10-05T17:00:00', venue: 'Main Auditorium', description: 'Music, dance and drama performances by students across all departments. Open to all.', banner: 'utsav_banner.jpg', brochure: null, createdBy: 'FAC1001', createdByName: 'Dr. Anita Sharma', status: 'active', created: '2026-08-20' },
  { id: 'EVT7003', title: 'Inter-College Sports Meet', type: 'Sports', datetime: '2026-09-28T08:30:00', venue: 'Sports Ground', description: 'Track and field, cricket, football and indoor games. Registrations open at the sports office.', banner: 'sports_meet_banner.jpg', brochure: 'sports_schedule.pdf', createdBy: 'FAC1001', createdByName: 'Dr. Anita Sharma', status: 'active', created: '2026-08-22' },
  { id: 'EVT7004', title: 'Guest Seminar: AI in Healthcare', type: 'Seminar', datetime: '2026-08-12T14:00:00', venue: 'Lecture Hall 2', description: 'A completed seminar on applications of machine learning in modern healthcare systems.', banner: 'ai_health_banner.jpg', brochure: null, createdBy: 'FAC1001', createdByName: 'Dr. Anita Sharma', status: 'active', created: '2026-07-30' },
];

/*
 * NOTE: There are intentionally NO login accounts, passwords, Firebase UIDs, or
 * demo credentials in this project. Authentication is handled entirely by
 * Firebase Authentication (see js/firebase/ and js/services/authService.js).
 *
 * The arrays above (faculty/students/etc.) are DEMO CONTENT for the dashboards
 * only — directory-style sample records with placeholder institutional emails.
 * They are NOT authentication credentials and cannot be used to sign in.
 * Real per-user profiles will live in PostgreSQL later, keyed by Firebase UID.
 */
