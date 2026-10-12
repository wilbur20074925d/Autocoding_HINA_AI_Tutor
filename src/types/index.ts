export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher';
  avatar?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description: string;
  teacherId: string;
  teacherIds?: string[];
  sourceTag?: string | null;
  overviewMarkdown?: string | null;
}

export interface Exercise {
  id: string;
  courseId: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  type: 'coding' | 'multiple-choice' | 'short-answer' | 'essay' | 'data-analysis';
  prompt: string;
  starterCode?: string;
  expectedOutput?: string;
  options?: string[]; // For multiple choice questions
  correctAnswer?: string | number; // For multiple choice or short answer
  sampleAnswer?: string; // For essay questions
  workedExample?: {
    problem: string;
    solution: string;
    explanation: string;
    keyLearningPoints: string[];
  };
  topics: string[];
  lectureNumber?: string; // Lecture number (e.g., '01', '02', ..., '11') for lecture-based exercises
  visibleFrom?: string; // ISO datetime string - when the exercise becomes visible to students
  isPublished?: boolean; // Whether the exercise is published and visible to students
}

export interface ChatMessage {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
  exerciseId?: string;
}

export interface Reflection {
  id: string;
  studentId: string;
  exerciseId: string;
  content: string;
  timestamp: Date;
  questions: {
    difficulties: string;
    genaiAssistance: string;
    improvements: string;
  };
}

export interface PromptLog {
  id: string;
  studentId: string;
  exerciseId: string;
  prompt: string;
  response: string;
  timestamp: Date;
}

export interface StudentProgress {
  studentId: string;
  exercisesCompleted: number;
  hintsUsed: number;
  averageScore: number;
  lastActivity: Date;
}
export interface ClassAnalytics {
  totalStudents: number;
  activeStudents: number;
  averageCompletion: number;
  commonErrors: string[];
  frequentQuestions: string[];
  genaiUsageStats: {
    totalPrompts: number;
    averagePromptsPerStudent: number;
    mostCommonPromptTypes: string[];
  };
}

export interface CourseResource {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: 'reading' | 'video' | 'tutorial' | 'dataset' | 'tool';
  url?: string;
  content?: string;
  author?: string;
  estimatedTime?: string;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  pdfUrl?: string;
  topics: string[];
  learningObjectives: string[];
  content: string;
  keyPoints: string[];
  practiceQuestions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  is_visible?: boolean; // Whether the module is visible to students
  createdAt?: string; // ISO timestamp used to rank session numbers earliest → latest
  createdBy?: string;
  /** Set only for student-generated sessions. Teacher sessions leave this empty. */
  sourceTag?: string | null;
}

export interface CourseEvaluationData {
  courseId: string;
  studentId: string;
  preTestDone: boolean;
  postTestDone: boolean;
  aiPracticeProgress: number; // 0-100
  gainScore: number | null;
  debugGain: number | null;
  transferScore: number | null;
  reportAvailable: boolean;
}

export interface LectureAttendance {
  id: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  attended: boolean;
  timestamp?: string;
}

export interface AttendanceData {
  courseId: string;
  studentId: string;
  totalLectures: number;
  attendedLectures: number;
  attendanceRate: number;
  lectures: LectureAttendance[];
}

export type AssignmentType = 'report' | 'code' | 'quiz' | 'general';

export function assignmentTypeLabel(type: string): string {
  switch (type) {
    case 'general':
      return 'General Assignment';
    case 'report':
      return 'Report';
    case 'code':
      return 'Code';
    case 'quiz':
      return 'Quiz';
    default:
      return type;
  }
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: AssignmentType;
  dueDate: string;
  status?: 'not-started' | 'in-progress' | 'submitted' | 'graded';
  points?: number;
  maxPoints?: number;
  topics: string[];
  instructions?: string;
  requirements?: string[];
  submissionType?: 'file' | 'text' | 'code' | 'quiz';
  lectureNumber?: string; // Lecture number (e.g., '01', '02', ..., '11') for lecture-based assessments
  isVisible?: boolean; // Whether the assignment is visible to students
  instructionFilePath?: string; // Path to instruction document (Word/PDF) for coding assignments
  csvFilePath?: string; // Path to single CSV (legacy); prefer csvFilePaths
  csvFilePaths?: string[]; // Paths to CSV data files for coding assignments (multiple)
}

export interface CourseOutline {
  id: string;
  course_id: string | null;
  course_code: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  version: number;
  uploaded_by: string | null;
  uploaded_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentDocument {
  id: string;
  assignment_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  version: number;
  uploaded_by: string | null;
  uploaded_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string | null;
  assignment_id_text: string | null;
  student_id: string;
  content: string | null;
  file_url: string | null;
  submission_type: 'text' | 'file' | 'code' | 'quiz' | null;
  editor_type?: 'word' | 'latex' | 'notebook'; // Editor type used for submission
  status: 'draft' | 'submitted' | 'graded' | 'returned';
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  max_score: number | null;
  feedback: string | null;
  graded_by: string | null;
  created_at: string;
  updated_at: string;
  student_name?: string; // For display purposes
}