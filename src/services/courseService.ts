import { supabase } from '../lib/supabase';
import type { Course, Task, TaskSubmission, User } from '../lib/supabase';
import type { Course as AppCourse } from '../types';
import { SubmissionNotificationService } from './submissionNotificationService';
import { fetchHinaUsersByIds } from './hinaUserStore';
import { dbCourseToAppCourse, isDbCourseAllowed } from '../utils/studentCourses';

export class CourseService {
  // Course management
  static async listCourseTeacherRows(): Promise<{ course_id: string; teacher_id: string }[]> {
    try {
      if (!supabase) return [];
      const { data, error } = await supabase.from('course_teachers').select('course_id, teacher_id');
      if (error) {
        console.error('Error fetching course teachers:', error);
        return [];
      }
      return (data || []) as { course_id: string; teacher_id: string }[];
    } catch (error) {
      console.error('Error in listCourseTeacherRows:', error);
      return [];
    }
  }

  static async getTaughtCourseIds(teacherId: string): Promise<string[]> {
    try {
      if (!supabase) return [];
      const ids = new Set<string>();

      const { data: assigned, error: assignErr } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherId);

      if (!assignErr) {
        for (const row of assigned || []) {
          if (row.course_id) ids.add(row.course_id as string);
        }
      }

      const { data: legacy, error: legacyErr } = await supabase
        .from('courses')
        .select('id, source_tag')
        .eq('teacher_id', teacherId);
      if (!legacyErr) {
        for (const row of legacy || []) {
          // Student-owned AI courses reuse teacher_id for ownership; keep them off staff dashboards.
          if (row.id && row.source_tag !== 'student_ai') ids.add(row.id as string);
        }
      }

      return [...ids];
    } catch (error) {
      console.error('Error in getTaughtCourseIds:', error);
      return [];
    }
  }

  static async getTeachersForCourse(courseId: string, extraTeacherIds: string[] = []): Promise<User[]> {
    try {
      if (!supabase || !courseId) return [];
      const ids = new Set<string>(extraTeacherIds.filter(Boolean));

      const { data: assigned, error: assignErr } = await supabase
        .from('course_teachers')
        .select('teacher_id')
        .eq('course_id', courseId);
      if (!assignErr) {
        for (const row of assigned || []) {
          if (row.teacher_id) ids.add(row.teacher_id as string);
        }
      }

      const { data: course, error: courseErr } = await supabase
        .from('courses')
        .select('teacher_id')
        .eq('id', courseId)
        .maybeSingle();
      if (!courseErr && course?.teacher_id) {
        ids.add(course.teacher_id as string);
      }

      if (!ids.size) return [];
      const users = await fetchHinaUsersByIds([...ids]);
      return users as User[];
    } catch (error) {
      console.error('Error in getTeachersForCourse:', error);
      return [];
    }
  }

  private static async withTeacherIds(courses: Course[]): Promise<Course[]> {
    if (!courses.length) return courses;
    const rows = await this.listCourseTeacherRows();
    const byCourse = new Map<string, string[]>();
    for (const row of rows) {
      const list = byCourse.get(row.course_id) || [];
      list.push(row.teacher_id);
      byCourse.set(row.course_id, list);
    }
    return courses.map((course) => {
      const fromJunction = byCourse.get(course.id) || [];
      const teacher_ids = [...new Set([...fromJunction, course.teacher_id].filter(Boolean))];
      return { ...course, teacher_ids };
    });
  }

  static async createCourse(courseData: {
    code: string;
    name: string;
    description: string;
    teacher_id: string;
  }): Promise<Course | null> {
    try {
      const { data, error } = await supabase
        .from('courses')
        .insert(courseData)
        .select()
        .single();

      if (error) {
        console.error('Error creating course:', error);
        return null;
      }

      if (data?.id && courseData.teacher_id && supabase) {
        const { error: assignErr } = await supabase.from('course_teachers').upsert(
          { course_id: data.id, teacher_id: courseData.teacher_id },
          { onConflict: 'course_id,teacher_id', ignoreDuplicates: true }
        );
        if (assignErr) {
          console.error('Error assigning course teacher:', assignErr);
        }
      }

      return data;
    } catch (error) {
      console.error('Error in createCourse:', error);
      return null;
    }
  }

  static async getCoursesByTeacher(teacherId: string): Promise<Course[]> {
    try {
      const courseIds = await this.getTaughtCourseIds(teacherId);
      if (!courseIds.length) return [];

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .in('id', courseIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching courses:', error);
        return [];
      }

      return this.withTeacherIds(data || []);
    } catch (error) {
      console.error('Error in getCoursesByTeacher:', error);
      return [];
    }
  }

  static async getAllCourses(): Promise<Course[]> {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all courses:', error);
        return [];
      }

      return this.withTeacherIds(data || []);
    } catch (error) {
      console.error('Error in getAllCourses:', error);
      return [];
    }
  }

  static async getEnrolledCourseIds(studentId: string): Promise<string[]> {
    try {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('student_id', studentId);
      if (error) {
        console.error('Error fetching student enrollments:', error);
        return [];
      }
      return (data || []).map((row) => row.course_id as string).filter(Boolean);
    } catch (error) {
      console.error('Error in getEnrolledCourseIds:', error);
      return [];
    }
  }

  static async getCoursesByIds(courseIds: string[]): Promise<Course[]> {
    try {
      const unique = [...new Set(courseIds)].filter(Boolean);
      if (!unique.length || !supabase) return [];
      const { data, error } = await supabase.from('courses').select('*').in('id', unique);
      if (error) {
        console.error('Error fetching courses by id:', error);
        return [];
      }
      return this.withTeacherIds(data || []);
    } catch (error) {
      console.error('Error in getCoursesByIds:', error);
      return [];
    }
  }

  /**
   * Courses the signed-in user may open: students see enrollments only;
   * teachers see courses they are assigned to (`course_teachers`);
   * admins see every course.
   */
  static async getVisibleCoursesForUser(user: Pick<User, 'id' | 'role'> & {
    enrolled_course_ids?: string[] | null;
  }): Promise<AppCourse[]> {
    try {
      if ((user.role as string) === 'admin') {
        const all = await this.getAllCourses();
        return all.map(dbCourseToAppCourse);
      }

      if ((user.role as string) === 'teacher') {
        const taught = await this.getCoursesByTeacher(user.id);
        return taught.map(dbCourseToAppCourse);
      }

      const [dbIds, allDb] = await Promise.all([
        this.getEnrolledCourseIds(user.id),
        this.getAllCourses(),
      ]);
      const allowedIds = [...dbIds, ...(user.enrolled_course_ids || [])];
      if (!allowedIds.length) return [];

      const fromCatalog = allDb.filter((course) => isDbCourseAllowed(course, allowedIds));
      if (fromCatalog.length > 0) {
        return fromCatalog.map(dbCourseToAppCourse);
      }

      const byId = await this.getCoursesByIds(dbIds);
      return byId.map(dbCourseToAppCourse);
    } catch (error) {
      console.error('Error in getVisibleCoursesForUser:', error);
      return [];
    }
  }

  static async updateCourse(courseId: string, updates: Partial<Course>): Promise<Course | null> {
    try {
      const { data, error } = await supabase
        .from('courses')
        .update(updates)
        .eq('id', courseId)
        .select()
        .single();

      if (error) {
        console.error('Error updating course:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in updateCourse:', error);
      return null;
    }
  }

  static async deleteCourse(courseId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      if (error) {
        console.error('Error deleting course:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteCourse:', error);
      return false;
    }
  }

  // Task management
  static async createTask(taskData: {
    course_id: string;
    title: string;
    description: string;
    type: Task['type'];
    difficulty: Task['difficulty'];
    content: any;
    due_date?: string;
    points?: number;
    created_by: string;
  }): Promise<Task | null> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) {
        console.error('Error creating task:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in createTask:', error);
      return null;
    }
  }

  static async getTasksByCourse(courseId: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tasks:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTasksByCourse:', error);
      return [];
    }
  }

  static async getPublishedTasks(): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching published tasks:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getPublishedTasks:', error);
      return [];
    }
  }

  static async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) {
        console.error('Error updating task:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in updateTask:', error);
      return null;
    }
  }

  static async publishTask(taskId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ is_published: true })
        .eq('id', taskId);

      if (error) {
        console.error('Error publishing task:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in publishTask:', error);
      return false;
    }
  }

  static async deleteTask(taskId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        console.error('Error deleting task:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteTask:', error);
      return false;
    }
  }

  // Task submission management
  static async submitTask(submissionData: {
    task_id: string;
    student_id: string;
    content: any;
  }): Promise<TaskSubmission | null> {
    try {
      const submittedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('task_submissions')
        .upsert({
          ...submissionData,
          status: 'submitted',
          submitted_at: submittedAt
        })
        .select()
        .single();

      if (error) {
        console.error('Error submitting task:', error);
        return null;
      }

      // Send email notification asynchronously (don't block submission)
      if (data) {
        // Fetch task and course information for email
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title, course_id, courses(name)')
          .eq('id', submissionData.task_id)
          .single();

        if (taskData) {
          const task = taskData as any;
          const courseName = task.courses?.name || 'Unknown Course';
          const taskTitle = task.title || 'Assignment';

          SubmissionNotificationService.sendAssignmentSubmissionEmail(
            submissionData.student_id,
            taskTitle,
            courseName,
            submittedAt
          ).catch(err => console.error('Failed to send assignment submission email:', err));
        }
      }

      return data;
    } catch (error) {
      console.error('Error in submitTask:', error);
      return null;
    }
  }

  static async getSubmissionsByTask(taskId: string): Promise<TaskSubmission[]> {
    try {
      const { data, error } = await supabase
        .from('task_submissions')
        .select('*')
        .eq('task_id', taskId)
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Error fetching submissions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSubmissionsByTask:', error);
      return [];
    }
  }

  static async getSubmissionsByStudent(studentId: string): Promise<TaskSubmission[]> {
    try {
      const { data, error } = await supabase
        .from('task_submissions')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching student submissions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSubmissionsByStudent:', error);
      return [];
    }
  }

  static async gradeSubmission(
    submissionId: string,
    score: number,
    feedback: string
  ): Promise<TaskSubmission | null> {
    try {
      const { data, error } = await supabase
        .from('task_submissions')
        .update({
          score,
          feedback,
          status: 'graded',
          graded_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) {
        console.error('Error grading submission:', error);
        return null;
      }

      // Send email notification asynchronously (don't block grading)
      if (data) {
        // Fetch task and course information for email
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title, course_id, courses(name)')
          .eq('id', data.task_id)
          .single();

        if (taskData) {
          const task = taskData as any;
          const courseName = task.courses?.name || 'Unknown Course';
          const taskTitle = task.title || 'Assignment';

          SubmissionNotificationService.sendAssignmentGradedEmail(
            data.student_id,
            taskTitle,
            courseName,
            score,
            100, // Default max score for task submissions
            feedback,
            data.graded_at || new Date().toISOString()
          ).catch(err => console.error('Failed to send assignment graded email:', err));
        }
      }

      return data;
    } catch (error) {
      console.error('Error in gradeSubmission:', error);
      return null;
    }
  }
}