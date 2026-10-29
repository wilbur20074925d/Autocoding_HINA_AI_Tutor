import type { Course } from '../types';
import type { Course as DbCourse, User } from '../lib/supabase';
import { mockCourses } from '../data/mockData';

type MaybeCourseUser = User & {
  enrolledCourseIds?: string[];
  enrolled_course_ids?: string[];
  courseIds?: string[];
  course_ids?: string[];
};

export function dbCourseToAppCourse(
  db: Pick<DbCourse, 'id' | 'code' | 'name' | 'description' | 'teacher_id'> & {
    teacher_ids?: string[];
    source_tag?: string | null;
    overview_markdown?: string | null;
  }
): Course {
  const teacherIds = [...new Set([...(db.teacher_ids || []), db.teacher_id].filter(Boolean))];
  return {
    id: db.id,
    code: db.code,
    name: db.name,
    description: db.description || '',
    teacherId: teacherIds[0] || db.teacher_id || '',
    teacherIds,
    sourceTag: db.source_tag || null,
    overviewMarkdown: db.overview_markdown || null,
  };
}

export function isGeneratedAiCourseCode(code?: string | null): boolean {
  return /^AI-[A-Z0-9]+$/i.test((code || '').trim());
}

/** Human-readable name for student AI courses (hides codes like AI-AYB0B54C). */
export function publicCourseName(course: {
  name?: string | null;
  code?: string | null;
  sourceTag?: string | null;
}): string {
  const name = (course.name || '').trim();
  if (name) return name;
  if (course.sourceTag === 'student_ai' || isGeneratedAiCourseCode(course.code)) return 'AI course';
  return (course.code || 'Course').trim();
}

export const getAllowedCourseIds = (user: MaybeCourseUser): string[] => {
  const ids =
    user.enrolledCourseIds ||
    user.enrolled_course_ids ||
    user.courseIds ||
    user.course_ids ||
    [];
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
};

export function courseMatchesAllowedIds(course: Course, allowedIds: string[]): boolean {
  if (!allowedIds.length) return false;
  const allowed = new Set(allowedIds);
  if (allowed.has(course.id) || allowed.has(course.code)) return true;
  const mock = mockCourses.find((mc) => mc.id === course.id || mc.code === course.code);
  return Boolean(mock && (allowed.has(mock.id) || allowed.has(mock.code)));
}

export function isDbCourseAllowed(db: Pick<DbCourse, 'id' | 'code'>, allowedIds: string[]): boolean {
  if (!allowedIds.length) return false;
  const allowed = new Set(allowedIds);
  if (allowed.has(db.id) || allowed.has(db.code)) return true;
  return mockCourses.some(
    (mc) =>
      (mc.code === db.code || mc.id === db.code || mc.id === db.id) &&
      (allowed.has(mc.id) || allowed.has(mc.code))
  );
}

export function resolveMockContentCourseId(course: Pick<Course, 'id' | 'code'>): string {
  const mock = mockCourses.find((mc) => mc.id === course.id || mc.code === course.code);
  return mock?.id ?? course.id;
}

export function findCourseInCatalog(courseId: string, catalog: Course[]): Course | undefined {
  const direct = catalog.find((c) => c.id === courseId || c.code === courseId);
  if (direct) return direct;
  const mock = mockCourses.find((mc) => mc.id === courseId || mc.code === courseId);
  if (!mock) return undefined;
  return catalog.find((c) => c.id === mock.id || c.code === mock.code);
}

export function getStudentDashboardCourses(user: User, allCourses: Course[]): Course[] {
  if (!user || user.role !== 'student') return allCourses;

  const allowedIds = getAllowedCourseIds(user as MaybeCourseUser);
  if (!allowedIds.length) return [];

  return allCourses.filter((c) => courseMatchesAllowedIds(c, allowedIds));
}

export function isStudentEnrolledInCourse(user: User, courseId: string, allCourses: Course[]): boolean {
  if (!user) return false;
  if (user.role !== 'student') return true;

  const allowedIds = getAllowedCourseIds(user as MaybeCourseUser);
  if (allowedIds.includes(courseId)) return true;

  const course = findCourseInCatalog(courseId, allCourses);
  if (!course) return false;
  if (!allowedIds.length) {
    return allCourses.some((c) => c.id === courseId || c.code === courseId);
  }
  return courseMatchesAllowedIds(course, allowedIds);
}

export function canUserAccessCourse(user: User | null | undefined, course: Course, visibleCourses: Course[]): boolean {
  if (!user) return false;
  const role = user.role as string;
  if (role === 'admin') return true;
  if (course.sourceTag === 'student_ai' && course.teacherId && course.teacherId === user.id) {
    return true;
  }
  if (role === 'student' || role === 'teacher') {
    return visibleCourses.some((c) => c.id === course.id || c.code === course.code);
  }
  return false;
}
