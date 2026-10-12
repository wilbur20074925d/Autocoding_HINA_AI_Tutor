import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[Supabase Init] Starting Supabase client initialization...');
console.log('[Supabase Init] Environment check:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlLength: supabaseUrl?.length || 0,
  keyLength: supabaseAnonKey?.length || 0,
  urlPreview: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'missing',
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase Init] ❌ Missing Supabase environment variables!');
  console.error('[Supabase Init] VITE_SUPABASE_URL:', supabaseUrl || 'MISSING');
  console.error('[Supabase Init] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '***' : 'MISSING');
  console.warn('[Supabase Init] Using demo mode - Supabase features will be disabled.');
}

let supabaseClient: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    console.log('[Supabase Init] Creating Supabase client...');
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
        storage: {
          getItem: (key: string) => {
            try {
              return localStorage.getItem(key);
            } catch (error) {
              // Silently handle storage errors
              return null;
            }
          },
          setItem: (key: string, value: string) => {
            try {
              localStorage.setItem(key, value);
            } catch (error) {
              // Silently handle storage errors
            }
          },
          removeItem: (key: string) => {
            try {
              localStorage.removeItem(key);
            } catch (error) {
              // Silently handle storage errors
            }
          }
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    console.log('[Supabase Init] ✅ Supabase client created successfully');
    
    // Test connection immediately
    supabaseClient.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('[Supabase Init] ❌ Initial session check failed:', {
            error: error.message,
            code: error.status,
            details: error,
          });
        } else {
          console.log('[Supabase Init] ✅ Initial session check:', {
            hasSession: !!data.session,
            userId: data.session?.user?.id || 'none',
            expiresAt: data.session?.expires_at || 'none',
          });
        }
      })
      .catch((error) => {
        console.error('[Supabase Init] ❌ Exception during initial session check:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });
  } catch (error) {
    console.error('[Supabase Init] ❌ Failed to create Supabase client:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    supabaseClient = null;
  }
} else {
  console.error('[Supabase Init] ❌ Cannot create client - missing credentials');
}

export const supabase = supabaseClient;

/**
 * Check if Supabase connection is healthy
 * This function attempts to make a simple request to verify connectivity
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
  details?: any;
}> {
  console.log('[Supabase Health] Checking Supabase connection...');
  
  if (!supabase) {
    console.error('[Supabase Health] ❌ Supabase client is null');
    return {
      connected: false,
      error: 'Supabase client not initialized',
    };
  }

  try {
    // Try to get the current session as a health check with timeout
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout after 5 seconds')), 5000);
    });
    
    const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
    
    if (error) {
      console.error('[Supabase Health] ❌ Connection check failed:', {
        error: error.message,
        code: error.status,
        details: error,
      });
      
      // Check if it's a network error
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
        return {
          connected: false,
          error: 'Network error - unable to reach Supabase',
          details: {
            message: error.message,
            code: error.status,
            isNetworkError: true,
          },
        };
      }
      
      return {
        connected: false,
        error: error.message,
        details: {
          code: error.status,
          message: error.message,
        },
      };
    }

    console.log('[Supabase Health] ✅ Connection check successful:', {
      hasSession: !!data.session,
      userId: data.session?.user?.id || 'none',
    });
    
    return {
      connected: true,
      details: {
        hasSession: !!data.session,
        userId: data.session?.user?.id || null,
      },
    };
  } catch (error) {
    console.error('[Supabase Health] ❌ Connection check exception:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        exception: true,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// Auth types
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  enrolled_course_ids?: string[] | null;
  // Optional two-factor auth metadata (status only, secret stays server-side)
  twofa_enabled?: boolean;
  twofa_enrolled_at?: string | null;
}

// Database types
export interface PromptAnalysis {
  id: string;
  student_id: string;
  exercise_id: string;
  prompt_text: string;
  clarity_score: number;
  specificity_score: number;
  strategy_score: number;
  overall_score: number;
  overreliance_risk: 'low' | 'medium' | 'high';
  improvement_trend: 'improving' | 'stable' | 'declining';
  common_weaknesses: string[];
  created_at: string;
  updated_at: string;
}

export interface PromptQualitySession {
  id: string;
  student_id: string;
  session_date: string;
  total_prompts: number;
  average_quality: number;
  created_at: string;
}

// Course and Task types
export interface Course {
  id: string;
  code: string;
  name: string;
  description: string;
  teacher_id: string;
  teacher_ids?: string[];
  source_tag?: string | null;
  overview_markdown?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseTeacherRow {
  course_id: string;
  teacher_id: string;
  created_at?: string;
}

export interface Task {
  id: string;
  course_id: string;
  title: string;
  description: string;
  type: 'coding' | 'multiple-choice' | 'short-answer' | 'essay' | 'data-analysis' | 'project';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  content: any; // JSON content
  due_date?: string;
  points: number;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  student_id: string;
  content: any; // JSON content
  score?: number;
  feedback?: string;
  status: 'draft' | 'submitted' | 'graded' | 'returned';
  submitted_at?: string;
  graded_at?: string;
  created_at: string;
  updated_at: string;
}