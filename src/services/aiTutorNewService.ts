import { supabase } from '../lib/supabase';
import { AuthService } from './authService';
import { GeminiService } from './geminiService';
import { AIInteractionAnalyticsService } from './aiInteractionAnalyticsService';

export interface AITutorNewMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  turn_number: number;
  created_at: string;
  metadata?: any;
}

export interface AITutorNewSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  course_id?: string | null;
}

export interface AITutorChatNoteMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  turnNumber: number;
  metadata?: {
    detectedStage?: string;
    messageRole?: string;
    apiUsed?: string;
    attachedFileName?: string;
    [key: string]: unknown;
  };
}

export interface AITutorChatNote {
  id: string;
  user_id: string;
  course_id?: string | null;
  title: string;
  messages: AITutorChatNoteMessage[];
  message_count: number;
  last_preview?: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface AITutorStaffSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  course_id?: string | null;
  message_count: number;
  last_preview?: string | null;
  user_name: string;
  user_email: string;
}

export type AITutorMode = 'default' | 'learning';

const HINA_SESSIONS = 'HINA_chat_sessions';
const HINA_MESSAGES = 'HINA_chat_messages';

const STAFF_SESSION_COLUMNS =
  'id, user_id, course_id, title, message_count, last_preview, created_at, updated_at, is_active';

type HinaMessageRow = {
  id: string;
  session_id: string;
  user_id?: string;
  client_message_id?: string | null;
  role: 'user' | 'assistant';
  content?: string | null;
  turn_number?: number | null;
  created_at: string;
  metadata?: AITutorChatNoteMessage['metadata'];
};

function rowToMessage(row: HinaMessageRow): AITutorNewMessage {
  return {
    id: String(row.client_message_id || row.id),
    session_id: row.session_id,
    role: row.role,
    content: row.content || '',
    turn_number: Number(row.turn_number || 1),
    created_at: row.created_at,
    metadata: row.metadata || {},
  };
}

function previewFromMessages(messages: AITutorChatNoteMessage[]): string | null {
  const last = [...messages].reverse().find((message) => message.content?.trim());
  if (!last) return null;
  const text = last.content.replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function messagesToNote(
  session: Pick<
    AITutorChatNote,
    'id' | 'user_id' | 'course_id' | 'title' | 'message_count' | 'last_preview' | 'created_at' | 'updated_at' | 'is_active'
  >,
  rows: HinaMessageRow[]
): AITutorChatNote {
  const messages = [...rows]
    .sort((a, b) => Number(a.turn_number || 0) - Number(b.turn_number || 0))
    .map((row) => ({
      id: String(row.client_message_id || row.id),
      role: row.role,
      content: row.content || '',
      createdAt: row.created_at,
      turnNumber: Number(row.turn_number || 1),
      metadata: row.metadata || {},
    }));
  return {
    id: session.id,
    user_id: session.user_id,
    course_id: session.course_id,
    title: session.title,
    messages,
    message_count: Number(session.message_count || messages.length),
    last_preview: session.last_preview,
    created_at: session.created_at,
    updated_at: session.updated_at,
    is_active: session.is_active,
  };
}

async function loadUserProfiles(userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
  const profiles = new Map<string, { name: string; email: string }>();
  const unique = [...new Set(userIds.filter(Boolean))];
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', chunk);
    if (error) {
      console.warn('AITutorNewService: Failed to load user profiles:', error.message);
      continue;
    }
    (data || []).forEach((row) => {
      const id = String(row.id ?? '');
      if (!id) return;
      profiles.set(id, {
        name: String(row.name ?? '').trim() || 'Unknown student',
        email: String(row.email ?? '').trim(),
      });
    });
  }
  return profiles;
}

function toStaffSession(
  note: Pick<
    AITutorChatNote,
    'id' | 'user_id' | 'course_id' | 'title' | 'message_count' | 'last_preview' | 'created_at' | 'updated_at' | 'is_active'
  >,
  profiles: Map<string, { name: string; email: string }>
): AITutorStaffSession {
  const profile = profiles.get(note.user_id);
  return {
    id: note.id,
    user_id: note.user_id,
    title: note.title || 'AI Learning Session',
    created_at: note.created_at,
    updated_at: note.updated_at,
    is_active: note.is_active,
    course_id: note.course_id,
    message_count: Number(note.message_count || 0),
    last_preview: note.last_preview,
    user_name: profile?.name || 'Unknown student',
    user_email: profile?.email || '',
  };
}

/** Max conversation turns sent to the model (sliding window) for longer memory without exceeding context limits. */
const MAX_HISTORY_MESSAGES = 50;

function courseScopeKeys(courseId?: string | null, courseCode?: string | null): string[] {
  const keys = new Set<string>();
  for (const value of [courseId, courseCode]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    keys.add(trimmed);
    keys.add(trimmed.toLowerCase());
    keys.add(trimmed.toUpperCase());
  }
  return Array.from(keys);
}

function sessionMatchesCourse(session: { course_id?: string | null }, courseKeys: string[]): boolean {
  const sessionCourseId = session.course_id?.trim();
  if (!sessionCourseId || courseKeys.length === 0) return false;
  return (
    courseKeys.includes(sessionCourseId) ||
    courseKeys.includes(sessionCourseId.toLowerCase()) ||
    courseKeys.includes(sessionCourseId.toUpperCase())
  );
}

async function loadMessageRows(sessionIds: string[]): Promise<Map<string, HinaMessageRow[]>> {
  const grouped = new Map<string, HinaMessageRow[]>();
  const unique = [...new Set(sessionIds.filter(Boolean))];
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(HINA_MESSAGES)
      .select('*')
      .in('session_id', chunk);
    if (error) {
      console.error('AITutorNewService: Error loading chat messages:', error);
      continue;
    }
    ((data || []) as HinaMessageRow[]).forEach((message) => {
      const list = grouped.get(message.session_id) || [];
      list.push(message);
      grouped.set(message.session_id, list);
    });
  }
  return grouped;
}

async function ownerRoleFor(userId: string): Promise<string> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  const role = String((data as { role?: string } | null)?.role || 'student').trim().toLowerCase();
  return role || 'student';
}

async function saveSessionMessages(
  sessionId: string,
  userId: string,
  messages: AITutorChatNoteMessage[]
): Promise<boolean> {
  const seen = new Set<string>();
  const rows = messages.map((message, index) => {
    let clientId = message.id || `${sessionId}-${index + 1}`;
    if (seen.has(clientId)) clientId = `${clientId}-${index + 1}`;
    seen.add(clientId);
    return {
      session_id: sessionId,
      user_id: userId,
      client_message_id: clientId,
      role: message.role,
      content: message.content || '',
      turn_number: Number(message.turnNumber || index + 1),
      metadata: message.metadata || {},
      created_at: message.createdAt || new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from(HINA_MESSAGES)
      .upsert(rows, { onConflict: 'session_id,client_message_id' });
    if (error) {
      console.error('AITutorNewService: Error saving chat messages:', error);
      return false;
    }
  }

  let deleteQuery = supabase.from(HINA_MESSAGES).delete().eq('session_id', sessionId);
  if (rows.length > 0) {
    const keep = rows.map((row) => row.client_message_id).join(',');
    deleteQuery = deleteQuery.not('client_message_id', 'in', `(${keep})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    console.error('AITutorNewService: Error pruning chat messages:', deleteError);
    return false;
  }
  return true;
}

function noteToSession(note: AITutorChatNote): AITutorNewSession {
  return {
    id: note.id,
    user_id: note.user_id,
    title: note.title,
    created_at: note.created_at,
    updated_at: note.updated_at,
    is_active: note.is_active,
    course_id: note.course_id,
  };
}

export function noteMessagesToRows(note: AITutorChatNote): AITutorNewMessage[] {
  const raw = Array.isArray(note.messages) ? note.messages : [];
  return raw
    .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant'))
    .map((msg, index) => ({
      id: msg.id || `${note.id}-${index}`,
      session_id: note.id,
      role: msg.role,
      content: msg.content || '',
      turn_number: Number(msg.turnNumber || (msg as { turn_number?: number }).turn_number || index + 1),
      created_at: msg.createdAt || note.updated_at,
      metadata: msg.metadata || {},
    }));
}

export class AITutorNewService {
  private static instance: AITutorNewService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): AITutorNewService {
    if (!AITutorNewService.instance) {
      AITutorNewService.instance = new AITutorNewService();
    }
    return AITutorNewService.instance;
  }

  /**
   * Check if database tables exist
   */
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      console.log('AITutorNewService: Checking database health...');
      
      // Try to query the sessions table
      const { error } = await supabase
        .from(HINA_SESSIONS)
        .select('id')
        .limit(1);

      if (error) {
        const missingTable =
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          /does not exist|schema cache/i.test(error.message || '');
        console.error('AITutorNewService: Database health check failed:', error);
        console.error('AITutorNewService: Error message:', error.message);
        console.error('AITutorNewService: Error code:', error.code);
        return !missingTable;
      }

      console.log('AITutorNewService: Database health check passed');
      return true;
    } catch (error) {
      console.error('AITutorNewService: Database health check exception:', error);
      return true;
    }
  }

  /**
   * Create a new AI Tutor chat note
   */
  async createSession(
    title: string = 'AI Tutor New Chat',
    courseId?: string | null
  ): Promise<AITutorNewSession | null> {
    const note = await this.upsertChatNote({
      title,
      courseId,
      messages: [],
    });
    return note;
  }

  /**
   * Upsert a structured chat note (full transcript). Safe to call on every autosave.
   */
  async upsertChatNote(params: {
    id?: string | null;
    title: string;
    courseId?: string | null;
    messages: AITutorChatNoteMessage[];
  }): Promise<AITutorNewSession | null> {
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) {
        console.error('AITutorNewService: No authenticated user found');
        return null;
      }

      const sessionFields = {
        title: params.title || 'AI Learning Session',
        course_id: params.courseId || null,
        message_count: params.messages.length,
        last_preview: previewFromMessages(params.messages),
        is_active: true,
      };

      let session: AITutorChatNote | null = null;
      if (params.id) {
        const { data, error } = await supabase
          .from(HINA_SESSIONS)
          .update(sessionFields)
          .eq('id', params.id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) {
          console.error('AITutorNewService: Error updating chat session:', error);
          return null;
        }
        session = data as AITutorChatNote;
      } else {
        const { data, error } = await supabase
          .from(HINA_SESSIONS)
          .insert({
            ...sessionFields,
            user_id: user.id,
            owner_role: await ownerRoleFor(user.id),
          })
          .select()
          .single();

        if (error) {
          console.error('AITutorNewService: Error creating chat session:', error);
          return null;
        }
        session = data as AITutorChatNote;
      }

      const saved = await saveSessionMessages(session.id, user.id, params.messages);
      if (!saved) return null;
      return noteToSession(session);
    } catch (error) {
      console.error('AITutorNewService: Exception upserting chat note:', error);
      return null;
    }
  }

  /**
   * Get current user's chat notes (one row per conversation)
   */
  async getUserSessions(
    courseId?: string | null,
    courseCode?: string | null
  ): Promise<AITutorNewSession[]> {
    try {
      const user = await AuthService.getAuthenticatedUser();
      
      if (!user) {
        console.error('AITutorNewService: No authenticated user found');
        return [];
      }

      const courseKeys = courseScopeKeys(courseId, courseCode);
      let query = supabase
        .from(HINA_SESSIONS)
        .select(STAFF_SESSION_COLUMNS)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (courseKeys.length > 0) {
        query = query.in('course_id', courseKeys);
      }

      const { data, error } = await query;

      if (error) {
        console.error('AITutorNewService: Error getting chat sessions:', error);
        return [];
      }

      const raw = (data || []) as unknown as AITutorChatNote[];
      const scoped = courseKeys.length
        ? raw.filter((note) => sessionMatchesCourse(note, courseKeys))
        : raw;
      return scoped.map(noteToSession);
    } catch (error) {
      console.error('AITutorNewService: Exception getting user sessions:', error);
      return [];
    }
  }

  /**
   * Get messages for a specific chat note
   */
  async getSessionMessages(sessionId: string): Promise<AITutorNewMessage[]> {
    try {
      const { data, error } = await supabase
        .from(HINA_MESSAGES)
        .select('*')
        .eq('session_id', sessionId)
        .order('turn_number', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('AITutorNewService: Error getting session messages:', error);
        return [];
      }

      return ((data || []) as HinaMessageRow[]).map(rowToMessage);
    } catch (error) {
      console.error('AITutorNewService: Exception getting session messages:', error);
      return [];
    }
  }

  /**
   * Get next turn number for a session
   */
  private async getNextTurnNumber(sessionId: string): Promise<number> {
    try {
      const { data: messages, error } = await supabase
        .from(HINA_MESSAGES)
        .select('turn_number')
        .eq('session_id', sessionId)
        .order('turn_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('AITutorNewService: Error getting next turn number:', error);
        return 1;
      }

      return messages && messages.length > 0 ? Number(messages[0].turn_number || 0) + 1 : 1;
    } catch (error) {
      console.error('AITutorNewService: Exception getting next turn number:', error);
      return 1;
    }
  }

  /**
   * Add a user message to the session
   */
  async addUserMessage(sessionId: string, content: string, metadata?: {
    detectedStage?: string;
    messageRole?: string;
    apiUsed?: string;
    attachedFileName?: string;
  }): Promise<AITutorNewMessage | null> {
    console.log('AITutorNewService: Adding user message to session:', sessionId);
    
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) return null;
      const turnNumber = await this.getNextTurnNumber(sessionId);
      console.log('AITutorNewService: Next turn number:', turnNumber);

      const { data, error } = await supabase
        .from(HINA_MESSAGES)
        .insert({
          session_id: sessionId,
          user_id: user.id,
          client_message_id: `user-${Date.now()}`,
          role: 'user',
          content: this.validateContent(content),
          turn_number: turnNumber,
          metadata: metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error('AITutorNewService: Error adding user message:', error);
        return null;
      }

      console.log('AITutorNewService: User message added successfully, turn:', turnNumber);
      
      // Update session timestamp
      await this.updateSessionTimestamp(sessionId);
      
      return rowToMessage(data as HinaMessageRow);
    } catch (error) {
      console.error('AITutorNewService: Exception adding user message:', error);
      return null;
    }
  }

  /**
   * Add an assistant message to the session
   * @param turnNumber Optional turn number. If provided, uses this turn number (same as user message).
   *                   If not provided, gets the next turn number (for backward compatibility).
   */
  async addAssistantMessage(sessionId: string, content: string, metadata?: {
    detectedStage?: string;
    messageRole?: string;
    apiUsed?: string;
    attachedFileName?: string;
    [key: string]: any;
  }, turnNumber?: number): Promise<AITutorNewMessage | null> {
    console.log('AITutorNewService: Adding assistant message to session:', sessionId);
    
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) return null;
      // Use provided turn number, or get next turn number if not provided (for backward compatibility)
      const finalTurnNumber = turnNumber !== undefined 
        ? turnNumber 
        : await this.getNextTurnNumber(sessionId);
      console.log('AITutorNewService: Using turn number:', finalTurnNumber);

      const { data, error } = await supabase
        .from(HINA_MESSAGES)
        .insert({
          session_id: sessionId,
          user_id: user.id,
          client_message_id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: this.validateContent(content),
          turn_number: finalTurnNumber,
          metadata: { 
            ...metadata, 
            originalLength: content.length,
            detectedStage: metadata?.detectedStage,
            messageRole: metadata?.messageRole,
            apiUsed: metadata?.apiUsed,
            attachedFileName: metadata?.attachedFileName
          }
        })
        .select()
        .single();

      if (error) {
        console.error('AITutorNewService: Error adding assistant message:', error);
        return null;
      }

      console.log('AITutorNewService: Assistant message added successfully, turn:', finalTurnNumber);
      
      // Update session timestamp
      await this.updateSessionTimestamp(sessionId);
      
      return rowToMessage(data as HinaMessageRow);
    } catch (error) {
      console.error('AITutorNewService: Exception adding assistant message:', error);
      return null;
    }
  }

  /**
   * Validate and truncate content if too long
   */
  private validateContent(content: string, maxLength: number = 100000): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    console.warn(`AITutorNewService: Content too long (${content.length} chars), truncating to ${maxLength} chars`);
    return content.substring(0, maxLength) + '\n\n[Content truncated due to length limit]';
  }

  /**
   * Batch insert all user messages for a conversation with progress tracking
   */
  async batchInsertUserMessages(
    sessionId: string, 
    userMessages: string[] | Array<{ content: string; metadata?: { detectedStage?: string; messageRole?: string; apiUsed?: string; attachedFileName?: string } }>, 
    onProgress?: (progress: number) => void
  ): Promise<AITutorNewMessage[]> {
    console.log('AITutorNewService: Batch inserting', userMessages.length, 'user messages');
    
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) return [];
      // Normalize input: convert string[] to objects with content
      const normalizedMessages = userMessages.map(msg => 
        typeof msg === 'string' 
          ? { content: msg, metadata: {} }
          : { content: msg.content, metadata: msg.metadata || {} }
      );

      // Get the starting turn number
      const startTurnNumber = await this.getNextTurnNumber(sessionId);
      console.log('AITutorNewService: Starting turn number:', startTurnNumber);

      // Check if we have long messages that need individual processing
      const longMessages = normalizedMessages.filter(msg => msg.content.length > 50000);
      const shortMessages = normalizedMessages.filter(msg => msg.content.length <= 50000);

      let allResults: AITutorNewMessage[] = [];
      let processedCount = 0;

      // Process short messages in batch
      if (shortMessages.length > 0) {
        console.log('AITutorNewService: Processing', shortMessages.length, 'short user messages in batch');
        
        const insertData = shortMessages.map((msg, index) => ({
          session_id: sessionId,
          user_id: user.id,
          client_message_id: `user-${Date.now()}-${index}`,
          role: 'user' as const,
          content: this.validateContent(msg.content),
          turn_number: startTurnNumber + index,
          metadata: msg.metadata || {}
        }));

        const batchInsertPromise = supabase
          .from(HINA_MESSAGES)
          .insert(insertData)
          .select();

        const batchTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Batch insert timeout after 30 seconds')), 30000);
        });

        const { data, error } = await Promise.race([batchInsertPromise, batchTimeoutPromise]);

        if (error) {
          console.error('AITutorNewService: Error batch inserting short user messages:', error);
        } else {
          allResults = [...allResults, ...((data || []) as HinaMessageRow[]).map(rowToMessage)];
          processedCount += shortMessages.length;
          onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
        }
      }

      // Process long messages individually with delays
      if (longMessages.length > 0) {
        console.log('AITutorNewService: Processing', longMessages.length, 'long user messages individually');
        
        for (let i = 0; i < longMessages.length; i++) {
          const msg = longMessages[i];
          const turnNumber = startTurnNumber + shortMessages.length + i;
          
          console.log(`AITutorNewService: Inserting long user message ${i + 1}/${longMessages.length}, turn ${turnNumber}`);
          
          try {
            const { data, error } = await supabase
              .from(HINA_MESSAGES)
              .insert({
                session_id: sessionId,
                user_id: user.id,
                client_message_id: `user-${Date.now()}-${i}`,
                role: 'user',
                content: this.validateContent(msg.content),
                turn_number: turnNumber,
                metadata: msg.metadata || {}
              })
              .select()
              .single();

            if (error) {
              console.error('AITutorNewService: Error inserting long user message:', error);
            } else {
              allResults.push(rowToMessage(data as HinaMessageRow));
            }
            
            processedCount++;
            onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
            
            // Add delay between long message inserts
            if (i < longMessages.length - 1) {
              console.log('AITutorNewService: Waiting 2 seconds before next long message...');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error('AITutorNewService: Exception inserting long user message:', error);
            processedCount++;
            onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
          }
        }
      }

      console.log('AITutorNewService: Batch inserted', allResults.length, 'user messages successfully');
      
      // Update session timestamp
      await this.updateSessionTimestamp(sessionId);
      
      return allResults;
    } catch (error) {
      console.error('AITutorNewService: Exception batch inserting user messages:', error);
      return [];
    }
  }

  /**
   * Batch insert all assistant messages for a conversation with progress tracking
   * @param startTurnNumber Optional starting turn number. If not provided, starts from 1 (same as user messages).
   *                        This ensures user and assistant messages in the same turn have the same turn number.
   */
  async batchInsertAssistantMessages(
    sessionId: string, 
    assistantMessages: string[] | Array<{ content: string; metadata?: { detectedStage?: string; messageRole?: string; apiUsed?: string; attachedFileName?: string } }>, 
    onProgress?: (progress: number) => void,
    startTurnNumber?: number
  ): Promise<AITutorNewMessage[]> {
    console.log('AITutorNewService: Batch inserting', assistantMessages.length, 'assistant messages');
    
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) return [];
      // Normalize input: convert string[] to objects with content
      const normalizedMessages = assistantMessages.map(msg => 
        typeof msg === 'string' 
          ? { content: msg, metadata: {} }
          : { content: msg.content, metadata: msg.metadata || {} }
      );

      // Use provided start turn number, or default to 1 (same as user messages)
      // This ensures user and assistant messages in the same turn share the same turn number
      const finalStartTurnNumber = startTurnNumber !== undefined ? startTurnNumber : 1;
      console.log('AITutorNewService: Starting turn number for assistant messages:', finalStartTurnNumber);

      // Check if we have long messages that need individual processing
      const longMessages = normalizedMessages.filter(msg => msg.content.length > 50000);
      const shortMessages = normalizedMessages.filter(msg => msg.content.length <= 50000);

      let allResults: AITutorNewMessage[] = [];
      let processedCount = 0;

      // Process short messages in batch
      if (shortMessages.length > 0) {
        console.log('AITutorNewService: Processing', shortMessages.length, 'short assistant messages in batch');
        
        const insertData = shortMessages.map((msg, index) => ({
          session_id: sessionId,
          user_id: user.id,
          client_message_id: `assistant-${Date.now()}-${index}`,
          role: 'assistant' as const,
          content: this.validateContent(msg.content),
          turn_number: finalStartTurnNumber + index,
          metadata: { 
            ...msg.metadata,
            originalLength: msg.content.length,
            detectedStage: msg.metadata?.detectedStage,
            messageRole: msg.metadata?.messageRole,
            apiUsed: msg.metadata?.apiUsed,
            attachedFileName: msg.metadata?.attachedFileName
          }
        }));

        const batchInsertPromise = supabase
          .from(HINA_MESSAGES)
          .insert(insertData)
          .select();

        const batchTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Batch insert timeout after 30 seconds')), 30000);
        });

        const { data, error } = await Promise.race([batchInsertPromise, batchTimeoutPromise]);

        if (error) {
          console.error('AITutorNewService: Error batch inserting short assistant messages:', error);
        } else {
          allResults = [...allResults, ...((data || []) as HinaMessageRow[]).map(rowToMessage)];
          processedCount += shortMessages.length;
          onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
        }
      }

      // Process long messages individually with delays
      if (longMessages.length > 0) {
        console.log('AITutorNewService: Processing', longMessages.length, 'long assistant messages individually');
        
        for (let i = 0; i < longMessages.length; i++) {
          const msg = longMessages[i];
          const turnNumber = finalStartTurnNumber + shortMessages.length + i;
          
          console.log(`AITutorNewService: Inserting long assistant message ${i + 1}/${longMessages.length}, turn ${turnNumber}`);
          
          try {
            const { data, error } = await supabase
              .from(HINA_MESSAGES)
              .insert({
                session_id: sessionId,
                user_id: user.id,
                client_message_id: `assistant-${Date.now()}-${i}`,
                role: 'assistant',
                content: this.validateContent(msg.content),
                turn_number: turnNumber,
                metadata: { 
                  ...msg.metadata,
                  originalLength: msg.content.length,
                  detectedStage: msg.metadata?.detectedStage,
                  messageRole: msg.metadata?.messageRole,
                  apiUsed: msg.metadata?.apiUsed,
                  attachedFileName: msg.metadata?.attachedFileName
                }
              })
              .select()
              .single();

            if (error) {
              console.error('AITutorNewService: Error inserting long assistant message:', error);
            } else {
              allResults.push(rowToMessage(data as HinaMessageRow));
            }
            
            processedCount++;
            onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
            
            // Add delay between long message inserts
            if (i < longMessages.length - 1) {
              console.log('AITutorNewService: Waiting 2 seconds before next long message...');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error('AITutorNewService: Exception inserting long assistant message:', error);
            processedCount++;
            onProgress?.(Math.round((processedCount / normalizedMessages.length) * 100));
          }
        }
      }

      console.log('AITutorNewService: Batch inserted', allResults.length, 'assistant messages successfully');
      
      // Update session timestamp
      await this.updateSessionTimestamp(sessionId);
      
      return allResults;
    } catch (error) {
      console.error('AITutorNewService: Exception batch inserting assistant messages:', error);
      return [];
    }
  }

  /**
   * Update session timestamp
   */
  private async updateSessionTimestamp(sessionId: string): Promise<void> {
    try {
      await supabase
        .from(HINA_SESSIONS)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch (error) {
      console.error('AITutorNewService: Error updating session timestamp:', error);
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(HINA_SESSIONS)
        .delete()
        .eq('id', sessionId);

      if (error) {
        console.error('AITutorNewService: Error deleting session:', error);
        return false;
      }

      console.log('AITutorNewService: Session deleted successfully');
      return true;
    } catch (error) {
      console.error('AITutorNewService: Exception deleting session:', error);
      return false;
    }
  }

  /**
   * Detect student state from conversation
   */
  private detectStudentState(
    currentMessage: string,
    history: AITutorNewMessage[]
  ): 'exploring' | 'stuck' | 'confident' | 'frustrated' {
    if (!history || history.length === 0) return 'exploring';
    
    const lowerMessage = currentMessage.toLowerCase();
    const recentMessages = history.slice(-4).map(m => m.content.toLowerCase()).join(' ');
    
    // Detect frustration signals
    if (lowerMessage.includes('stuck') || lowerMessage.includes('frustrated') || 
        lowerMessage.includes('not working') || lowerMessage.includes('still') ||
        (recentMessages.includes('error') && history.length > 3)) {
      return 'frustrated';
    }
    
    // Detect confidence signals
    if (lowerMessage.includes('i think') || lowerMessage.includes('i believe') ||
        lowerMessage.includes('maybe') || lowerMessage.includes('should')) {
      return 'confident';
    }
    
    // Detect stuck signals
    if (lowerMessage.includes('help') || lowerMessage.includes('how') ||
        lowerMessage.includes('what') || lowerMessage.includes('why')) {
      return 'stuck';
    }
    
    return 'exploring';
  }

  /**
   * Select response type with variety
   */
  private selectResponseType(history: AITutorNewMessage[]): string {
    // Rotate response types to avoid repetition
    const types = ['explanation', 'example_driven', 'structured', 'analogical'];
    
    // Simple rotation based on conversation length
    const index = history.length % types.length;
    return types[index];
  }

  /**
   * Check if the student's message is a greeting
   * Returns true if the message is ONLY a greeting (not a greeting followed by other content)
   */
  private isGreeting(message: string): boolean {
    if (!message || typeof message !== 'string') {
      console.log('AITutorNewService: isGreeting - invalid message:', message);
      return false;
    }
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      console.log('AITutorNewService: isGreeting - empty message after trim');
      return false;
    }
    
    const lowerMessage = trimmedMessage.toLowerCase();
    const greetingWords = [
      'hello',
      'hi',
      'hey',
      'greetings',
      'good to see you',
      'nice to meet you',
      'pleased to meet you',
      'glad to meet you',
      'happy to meet you',
      'lovely to meet you',
      'good morning',
      'good afternoon',
      'good evening',
      'it\'s a pleasure to meet you',
      'it is a pleasure to meet you',
      'how do you do',
      'great to see you',
      'good to have you here',
      'nice seeing you',
      'happy to see you',
      'welcome'
    ];
    
    // Remove all punctuation and normalize whitespace for comparison
    const normalizedMessage = lowerMessage
      .replace(/[.,!?;:'"()\[\]{}]/g, '') // Remove common punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    console.log('AITutorNewService: Checking if greeting.');
    console.log('  Original message:', JSON.stringify(trimmedMessage));
    console.log('  Lowercase:', JSON.stringify(lowerMessage));
    console.log('  Normalized:', JSON.stringify(normalizedMessage));
    
    // Check if the normalized message exactly matches a greeting
    let matchedGreeting = null;
    const isMatch = greetingWords.some(greeting => {
      const greetingLower = greeting.toLowerCase();
      const match = normalizedMessage === greetingLower;
      if (match) {
        matchedGreeting = greetingLower;
      }
      return match;
    });
    
    if (isMatch) {
      console.log('AITutorNewService: ✅ GREETING DETECTED:', matchedGreeting);
    } else {
      console.log('AITutorNewService: ❌ Not a greeting');
    }
    
    return isMatch;
  }

  /**
   * Check if the question is related to social data science
   */
  private isSocialDataScienceRelated(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // If it's a greeting, consider it on-topic (we'll handle it separately)
    if (this.isGreeting(message)) {
      return true;
    }
    
    // Keywords related to social data science
    const socialDataScienceKeywords = [
      // Data science terms
      'data', 'dataset', 'analysis', 'analyze', 'statistic', 'visualization', 'visualize',
      'variable', 'correlation', 'regression', 'model', 'algorithm', 'machine learning',
      // Social science terms
      'social', 'society', 'population', 'survey', 'research', 'study', 'sample',
      'demographic', 'behavior', 'behavioral', 'human', 'people', 'community',
      'network', 'relationship', 'interaction', 'social network',
      // Social data science specific
      'social data', 'social media', 'social network analysis', 'social research',
      'data collection', 'data gathering', 'ethical', 'ethics', 'privacy',
      'bias', 'fairness', 'representation', 'sampling', 'methodology',
      // Common questions that could be related
      'how to', 'what is', 'explain', 'help', 'understand', 'learn', 'teach',
      'concept', 'example', 'practice', 'exercise', 'assignment', 'project',
      'code', 'programming', 'python', 'r ', 'sql', 'pandas', 'numpy',
      'visualization', 'chart', 'graph', 'plot', 'dashboard'
    ];
    
    // Check if message contains social data science related keywords
    const hasRelevantKeywords = socialDataScienceKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
    
    // If the message is very short or just a question word, assume it might be related
    if (message.trim().length < 10) {
      return true;
    }
    
    return hasRelevantKeywords;
  }

  /**
   * Generate AI response using Gemini
   */
  async generateAIResponse(
    sessionId: string,
    userMessage: string,
    codeRequestCount: number = 0,
    tutorMode: AITutorMode = 'learning',
    courseId?: string | null,
    courseCode?: string | null,
    abortSignal?: AbortSignal
  ): Promise<string> {
    console.log('AITutorNewService: Generating AI response for session:', sessionId);
    console.log('AITutorNewService: User message received:', userMessage);
    console.log('AITutorNewService: Tutor mode:', tutorMode);
    const isDirectAnswerMode = tutorMode === 'default';
    const courseLabel = [courseCode, courseId].map((value) => value?.trim()).find(Boolean);
    const courseLine = courseLabel
      ? `\nThe student is currently studying course ${courseLabel}. Use course context when it helps, but still answer academic questions even if they are not unique to this course.\n`
      : '';
    
    try {
      // Check if the user's message is a greeting - if so, return hardcoded response WITHOUT calling AI
      const isGreeting = this.isGreeting(userMessage);
      console.log('AITutorNewService: Greeting check result:', isGreeting);
      
      if (isGreeting) {
        console.log('AITutorNewService: ✅ Detected greeting - RETURNING HARDCODED RESPONSE (NOT calling AI)');
        const hardcodedResponse = "Hello! I'm ready to help you learn about something new today. What topic are you curious about, or what are you working on right now?";
        console.log('AITutorNewService: Returning hardcoded response:', hardcodedResponse);
        return hardcodedResponse;
      }
      
      console.log('AITutorNewService: Not a greeting - proceeding to AI generation');

      const messages = sessionId ? await this.getSessionMessages(sessionId) : [];
      console.log('AITutorNewService: Retrieved', messages.length, 'messages');
      
      // Detect student state from conversation
      const studentState = this.detectStudentState(userMessage, messages);
      const responseType = this.selectResponseType(messages);
      
      // Progressive code disclosure: 1st = pseudo-code, 2nd = partial code + explanation, 3rd+ = full code
      // Default mode skips scaffolding and gives the full answer immediately.
      let codeDisclosureInstruction = '';
      if (isDirectAnswerMode && codeRequestCount >= 1) {
        codeDisclosureInstruction =
          '\n\nCODE REQUEST: The user is asking for code. Provide COMPLETE, well-formatted, runnable code immediately with proper markdown code blocks and language tags (e.g. ```python). Do NOT withhold code, use pseudo-code, or give only a partial solution. Output the FULL code from start to finish.';
      } else if (codeRequestCount === 1) {
        codeDisclosureInstruction =
          '\n\nCODE REQUEST (first time): The user is asking for code. Provide PSEUDO-CODE only — high-level steps in plain language or very simple placeholder syntax (e.g. "STEP 1: load data", "STEP 2: loop over rows"). Do NOT write runnable code. Explain the logic and structure. Keep it concise (about 100–150 words, not counting any code). End with 1 question inviting them to ask for more detail or partial code next.';
      } else if (codeRequestCount === 2) {
        codeDisclosureInstruction =
          '\n\nCODE REQUEST (second time): The user asked for code again. Provide SOME PART of the actual code (e.g. key functions or the main loop) in a markdown code block, and EXPLAIN that part clearly. Do NOT give the full, complete program yet. Leave room for them to ask once more for the full solution. After the partial code and explanation, add 1–2 short reflection questions.';
      } else if (codeRequestCount >= 3) {
        codeDisclosureInstruction =
          '\n\nCODE REQUEST (third time): The user has asked for code again. Provide COMPLETE, well-formatted, runnable code with proper markdown code blocks and language tags (e.g. ```python). No word or token limit — output the FULL code from start to finish. After the code, include 2–3 short reflection questions.';
      }
      
      // Build greeting guidance
      let greetingGuidance = '';
      if (isGreeting) {
        greetingGuidance = `\n\nCRITICAL: The student sent a greeting. Reply warmly in 1 sentence and invite a study question. If their message also contains a real question, answer that question immediately after the greeting.`;
      }
      
      // Build conversation context with new principles
      let conversationContext = `You are an AI Tutor designed to help students learn through EXPLANATION-FIRST teaching. Your primary role is to EXPLAIN and TEACH, not to question.

You help students with academic topics, including:
- Programming, algorithms, and data structures (binary search, sorting, recursion, complexity, Python, and other languages)
- Data science, statistics, visualization, and research methods
- Mathematics and computational thinking
- Course assignments and conceptual questions
${courseLine}
CRITICAL ANSWER RULE (HIGHEST PRIORITY):
- ALWAYS answer the student's actual question. Do not refuse academic topics.
- Programming, algorithms, data structures, math, statistics, and data science are in scope.
- If the message includes a greeting AND a question (e.g. "hello, tell me binary search"), greet in at most one short sentence, then immediately explain the topic they asked about.
- Do NOT say you only specialize in social data science.
- Do NOT redirect the student away from their question.
- Only decline clearly non-academic or harmful requests; then invite a study question.

CRITICAL PRINCIPLES:
0. ANSWER FIRST (HIGHEST PRIORITY): Explain the concept the student asked about. Never replace the answer with a topic-redirect or identity pitch.
1. EXPLAIN FIRST: Your primary job is to EXPLAIN and TEACH concepts clearly, but be CONCISE and BRIEF. Keep explanations focused and to-the-point.
2. QUESTIONS ARE OPTIONAL: Only ask questions if they genuinely extend understanding. You can omit questions entirely.
3. CONCISE RESPONSES: Provide clear, concise explanations. Be brief but complete. Maximum 100-150 words total for your reply (do not count code in code blocks).
4. STRUCTURED FORMATTING: Use clear paragraph breaks, bullet points, headings, and organized sections. Separate ideas into distinct paragraphs.
5. CODE REQUESTS (progressive): 1st time — pseudo-code only (steps/logic, no runnable code). 2nd time — partial code + explanation (some real code, not full). 3rd time — full, runnable code in markdown code blocks + 2–3 reflection questions.
6. TOKEN MANAGEMENT: Keep your response SHORT. Explain the core idea in 1-2 sentences, give 1 quick suggestion, and optionally 1 question. Do not exceed 100-150 words (excluding code).
7. RESPONSE OPENING (CRITICAL - STRICTLY ENFORCED):
   - DO NOT start responses with conversational openings like "Hello! Today, we're going to explore...", "Let's explore...", "Today we'll learn...", or similar phrases
   - DO NOT use greetings unless the student sent a greeting (and even then, keep it brief)
   - START DIRECTLY with the explanation or content - jump straight into answering the question
   - Example of WRONG opening: "Hello! Today, we're going to explore how authors use imagery..."
   - Example of CORRECT opening: "Imagery is the use of descriptive language that appeals to our five senses..."
   - Your first sentence should be the actual explanation, not a meta-commentary about what you're going to do

RESPONSE STRUCTURE:

STRUCTURED FORMATTING (CRITICAL):
- Use clear paragraph breaks - separate each idea into its own paragraph
- Use bullet points for lists (NOT in paragraph form)
- Use headings (##) to organize sections
- Use numbered lists for step-by-step instructions
- Break up long explanations into multiple paragraphs
- Each paragraph should focus on ONE main idea

[40%] EXPLANATION/INFORMATION - Lead with this (KEEP IT BRIEF):
- CRITICAL: Answer the student's question. Start with the explanation of what they asked.
- START DIRECTLY with the explanation - NO conversational openings, NO "Today we're going to...", NO "Let's explore..."
- Provide valuable content first - jump straight into answering the question
- Explain concepts clearly: HOW and WHY things work (in 1-2 sentences maximum)
- Give 1 concrete example if needed
- Share key insights briefly
- Break down complex ideas into understandable parts (concise version)
- CRITICAL: Keep this section to 2-3 sentences maximum. Do not elaborate extensively.
- CRITICAL: Your first sentence must be the actual explanation, not a meta-commentary about what you're going to do

[30%] GUIDANCE/SUPPORT (BRIEF):
- Show the path forward clearly (1 sentence)
- Provide 1 actionable step
- Give 1 concrete strategy they can apply
- Keep this to 1-2 sentences maximum

[20%] ILLUSTRATION/ANALOGY (OPTIONAL - ONLY IF SPACE ALLOWS):
- Use a brief analogy if it helps understanding (1 sentence)
- Keep it concise - skip if approaching word limit

[10%] SOCRATIC QUESTIONING (OPTIONAL):
- AFTER your explanation, include 1 Socratic question IF you have space (under word limit)
- Questions should extend understanding, not test knowledge
- Make questions collaborative and thought-provoking
- Examples: "What do you think would happen if...?", "How does this connect to...?"
- Skip if needed to stay within word limit

COMMUNICATION STYLE:
- Be encouraging and supportive
- Use ${studentState === 'frustrated' ? 'supportive and direct' : studentState === 'stuck' ? 'patient and clear' : 'conversational and clear'} tone
- Adapt to the student's learning pace
- Provide value first, then guide thinking

FORMATTING INSTRUCTIONS (CRITICAL):
- Use Markdown formatting: **bold** for important messages, \`code\` for inline code, code blocks for code snippets
- ALWAYS wrap code in markdown code blocks with language tags: \`\`\`python\ncode\n\`\`\`
- ALWAYS use LaTeX for mathematical formulas: inline \`\$formula\$\` or block \`\$\$formula\$\$\`
- Use **bold** for key concepts, important warnings, and critical information
- Structure with headings, bullet points, numbered lists
- Use blockquotes > for important notes
- When displaying code: use proper markdown code blocks (not plain text)
- When displaying formulas: use LaTeX format with $ delimiters (not plain text)

FORMATTING REQUIREMENTS (CRITICAL):
1. PARAGRAPH STRUCTURE: 
   - Write in clear paragraphs - separate each idea into its own paragraph
   - Each paragraph should focus on ONE main idea
   - Separate paragraphs with blank lines (double line breaks)
   - Do NOT write everything in one paragraph

2. LISTS AND BULLET POINTS:
   - Use bullet points (• or -) for lists of items
   - Use numbered lists (1., 2., 3.) for step-by-step instructions
   - Each item in a list should be on its own line
   - Use proper Markdown list formatting

3. HEADINGS:
   - Use ## for main sections
   - Use ### for subsections
   - Organize your response with clear sections

CRITICAL REMINDERS - TOKEN LIMIT ENFORCEMENT:
- EXPLAIN FIRST, but keep it CONCISE (1-2 sentences)
- Your primary goal: TEACH and EXPLAIN concepts clearly but BRIEFLY
- MAXIMUM 100-150 words total for your reply (do not count code). Be concise.
- Use STRUCTURED paragraphs - NOT one long paragraph
- Use bullet points and lists for structured information (sparingly)
- Socratic questions are OPTIONAL - include only if within word limit
- Connect your response to conversation history briefly
- Prioritize brevity over completeness - better to be short and clear than long and token-consuming

CRITICAL TOKEN MANAGEMENT RULES:
1. Keep explanation to 2-3 sentences maximum
2. Keep guidance to 1-2 sentences maximum  
3. Skip analogies if needed to stay within limit
4. Socratic questions are optional - skip if over limit
5. Total response should be 100-150 words MAXIMUM (excluding code blocks)

REMEMBER: Be CONCISE and BRIEF. Write in clear, separated paragraphs. Use bullet points sparingly. Your job is to EXPLAIN clearly but briefly, not to provide exhaustive explanations that consume all tokens.

CRITICAL - RESPONSE OPENING RULES (MANDATORY):
- NEVER start with "Hello! Today, we're going to explore..." or similar conversational openings
- NEVER start with "Let's explore...", "Today we'll learn...", "We're going to discuss..." or similar phrases
- START DIRECTLY with the actual explanation or answer to the question
- Your first sentence should be the content itself, not a statement about what you're going to do
- Example WRONG: "Hello! Today, we're going to explore how authors use imagery to make their writing more vivid..."
- Example CORRECT: "Imagery is the use of descriptive language that appeals to our five senses, helping us to 'see,' 'hear,' 'smell,' 'taste,' and 'feel' what the author is describing."
- The ONLY exception is when responding to a greeting - and even then, keep the greeting brief (1 sentence) and immediately answer any question they asked

`;

      conversationContext += `Conversation History:\n`;

      // Sliding window: send only the last N messages to stay within context limits while keeping longer memory
      const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
      const currentUserMessageInHistory = messages.length > 0 &&
        messages[messages.length - 1]?.role === 'user' &&
        messages[messages.length - 1]?.content === userMessage;

      recentMessages.forEach((msg) => {
        const role = msg.role === 'user' ? 'Student' : 'AI Tutor';
        conversationContext += `Turn ${msg.turn_number} - ${role}: ${msg.content}\n`;
      });

      // Only add the current user message if it's not already in the history
      if (!currentUserMessageInHistory) {
        conversationContext += `Student: ${userMessage}\n`;
      }
      
      // Add final reminder about response format (only for non-greetings) before the response prompt
      if (!isGreeting) {
        conversationContext += `\nFINAL REMINDER: Start your response DIRECTLY with the explanation. DO NOT use conversational openings like "Hello! Today, we're going to explore..." or "Let's explore...". Jump straight into answering the question with the actual content.\n\n`;
      }

      if (isDirectAnswerMode) {
        conversationContext += `\nCURRENT MODE: DEFAULT (DIRECT ANSWER)
Give complete, direct answers to the student's question.
- Do NOT withhold the solution, use hints-only replies, or Socratic questioning
- Do NOT end with a quiz or reflection question unless the student asked one
- If they ask for code, provide the FULL runnable code immediately
- Keep markdown/LaTeX formatting, and brevity (100-150 words excluding code)

`;
      }
      
      conversationContext += `AI Tutor:`;

      console.log('AITutorNewService: Generated context length:', conversationContext.length);

      // Note: GeminiService uses ZenMux for AI tutor (works in HK; OpenRouter may be unavailable)
      // Set VITE_ZENMUX_API_KEY in .env. Fallbacks are handled internally if key is missing.
      console.log('AITutorNewService: Using ZenMux via GeminiService');
      
      if (abortSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Generate response with timeout
      const timeoutPromise = new Promise<string>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Gemini API timeout after 30 seconds')), 30000);
        abortSignal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });

      // DOUBLE CHECK: If this is a greeting, we should have returned earlier
      // This is a safety check to prevent any greetings from reaching the AI
      const doubleCheckIsGreeting = this.isGreeting(userMessage);
      if (doubleCheckIsGreeting) {
        console.error('AITutorNewService: ⚠️ WARNING - Greeting detected right before AI call! This should not happen. Returning hardcoded response.');
        return "Hello! I'm ready to help you learn about something new today. What topic are you curious about, or what are you working on right now?";
      }
      
      // Learning mode: full code only on 3rd+ request. Default mode: full code immediately.
      const isFullCodeResponse = isDirectAnswerMode ? codeRequestCount >= 1 : codeRequestCount >= 3;
      const brevityInstruction = isFullCodeResponse
        ? (isDirectAnswerMode
            ? '\n\nProvide COMPLETE code only: a short intro, then the full code in a markdown code block (e.g. ```python). Do NOT apply any word or token limit. Do NOT truncate the code — output it in full. Do NOT add reflection questions.'
            : '\n\nProvide COMPLETE code only: a short intro, then the full code in a markdown code block (e.g. ```python), then 2-3 reflection questions. Do NOT apply any word or token limit. Do NOT truncate the code — output it in full.')
        : (!isGreeting
            ? (isDirectAnswerMode
                ? '\n\nCRITICAL - Keep it brief but complete:\n- START DIRECTLY with the answer - NO "Hello! Today, we\'re going to explore..." or similar openings\n- Give the complete answer directly — do not withhold information\n- Explain the core idea in just 2–3 complete sentences (finish your thoughts)\n- Do NOT end with a Socratic or quiz question\n\nMaximum 100–150 words total for your reply (do not count code in code blocks). Be concise but ensure all sentences are complete. Format with clear paragraph breaks. Use proper markdown for code blocks and LaTeX for formulas.\n\nREMEMBER: Your first sentence must be the actual answer, NOT a conversational opening.'
                : '\n\nCRITICAL - Keep it brief but complete:\n- START DIRECTLY with the explanation - NO "Hello! Today, we\'re going to explore..." or similar openings\n- Explain the core idea in just 2–3 complete sentences (finish your thoughts)\n- Give 1 quick suggestion for next step\n- End with 1 complete question\n\nMaximum 100–150 words total for your reply (do not count code in code blocks). Be concise but ensure all sentences are complete. Fit everything (explanation, guidance, optional question) within this limit. Format with clear paragraph breaks. Use proper markdown for code blocks and LaTeX for formulas.\n\nREMEMBER: Your first sentence must be the actual explanation, NOT a conversational opening like "Hello! Today, we\'re going to explore..."')
            : '');
      const formattedContext = conversationContext + greetingGuidance + codeDisclosureInstruction + brevityInstruction;

      // Code responses: no token/word limit — use high max_tokens and system prompt that does not impose brevity
      const codeModeSystemPrompt = isDirectAnswerMode
        ? `You are a helpful tutor. For this turn you must provide COMPLETE code.
- Do NOT apply any word limit or token limit. Output the full, runnable code from start to finish.
- Do NOT truncate or shorten the code. The code must be complete and copy-paste runnable.
- Use markdown code blocks with language tags (e.g. \`\`\`python). Do NOT add reflection questions.`
        : `You are a helpful tutor. For this turn you must provide COMPLETE code.
- Do NOT apply any word limit or token limit. Output the full, runnable code from start to finish.
- Do NOT truncate or shorten the code. The code must be complete and copy-paste runnable.
- Use markdown code blocks with language tags (e.g. \`\`\`python). After the code, add 2-3 short reflection questions.`;

      console.log('AITutorNewService: About to call GeminiService.generateContent - this should NOT happen for greetings');
      const geminiPromise = GeminiService.generateContent(formattedContext, null, {
        max_tokens: isFullCodeResponse ? 8192 : undefined,
        systemPrompt: isFullCodeResponse ? codeModeSystemPrompt : undefined,
        abortSignal,
      });
      
      const response = await Promise.race([geminiPromise, timeoutPromise]);
      
      console.log('AITutorNewService: Received response from Gemini, length:', response?.length || 0);
      
      // Log word count for monitoring (no truncation - allow detailed responses)
      if (response) {
        const wordCount = response.split(/\s+/).length;
        console.log(`AITutorNewService: Response word count: ${wordCount} words`);
      }
      
      return response || this.generateFallbackResponse(userMessage);
      
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || abortSignal?.aborted) {
        throw error;
      }
      console.error('AITutorNewService: Error generating AI response:', error);
      return this.generateFallbackResponse(userMessage);
    }
  }

  /**
   * Generate fallback response when API fails
   */
  private generateFallbackResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();
    
    // Check if it's a greeting first
    if (this.isGreeting(userMessage)) {
      // Match the greeting style
      let greeting = 'Hello';
      if (lowerMessage.includes('hi')) greeting = 'Hi';
      else if (lowerMessage.includes('hey')) greeting = 'Hey';
      else if (lowerMessage.includes('good morning')) greeting = 'Good morning';
      else if (lowerMessage.includes('good afternoon')) greeting = 'Good afternoon';
      else if (lowerMessage.includes('good evening')) greeting = 'Good evening';
      
      return `${greeting}! I'm your AI tutor. I'm here to help you learn.

I can help with programming, algorithms, data science, statistics, and other academic topics. What would you like to learn about today?`;
    }
    
    if (lowerMessage.includes('math') || lowerMessage.includes('calculate')) {
      return `I'd be happy to help you with math! I can assist with:
• **Algebra**: Solving equations, working with variables
• **Geometry**: Shapes, angles, area, and perimeter
• **Calculus**: Derivatives, integrals, limits
• **Statistics**: Data analysis, probability, distributions
What specific math topic would you like to explore? Feel free to ask me about any concept you're working on!`;
    }
    
    if (lowerMessage.includes('code') || lowerMessage.includes('programming') || lowerMessage.includes('binary search') || lowerMessage.includes('algorithm')) {
      return `Great! I love helping with programming. I can assist with:
• **Programming Concepts**: Variables, loops, functions, data structures
• **Languages**: Python, JavaScript, Java, C++, and more
• **Algorithms**: Sorting, searching, problem-solving approaches
• **Debugging**: Finding and fixing errors in your code
What programming language or concept would you like to work on? Share your code or describe the problem you're facing!`;
    }
    
    if (lowerMessage.includes('science') || lowerMessage.includes('physics') || lowerMessage.includes('chemistry')) {
      return `Science is fascinating! I can help you understand:
• **Physics**: Motion, forces, energy, waves, electricity
• **Chemistry**: Elements, compounds, reactions, bonding
• **Biology**: Cells, genetics, evolution, ecosystems
• **Earth Science**: Weather, geology, astronomy
What scientific concept would you like to explore? I can explain complex topics in simple terms!`;
    }
    
    return `I'm your AI tutor! I'm here to help you learn.

I can assist with programming, algorithms, data science, statistics, mathematics, and other academic topics. What would you like to work on today?`;
    }

  /**
   * Get all chat data for analytics (sessions and messages)
   */
  async getAllChatDataForAnalytics(
    userId?: string,
    courseId?: string | null,
    courseCode?: string | null
  ): Promise<{
    sessions: AITutorNewSession[];
    messages: AITutorNewMessage[];
  }> {
    try {
      const targetUserId = userId || (await AuthService.getAuthenticatedUser())?.id;
      
      if (!targetUserId) {
        console.error('AITutorNewService: No user ID provided for analytics');
        return { sessions: [], messages: [] };
      }

      const { data: notes, error: sessionsError } = await supabase
        .from(HINA_SESSIONS)
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (sessionsError) {
        console.error('AITutorNewService: Error fetching sessions for analytics:', sessionsError);
        return { sessions: [], messages: [] };
      }

      const courseKeys = courseScopeKeys(courseId, courseCode);
      const scopedNotes = courseKeys.length
        ? (notes || []).filter((note: AITutorChatNote) =>
            sessionMatchesCourse(note, courseKeys)
          )
        : notes || [];

      const scopedSessions = scopedNotes.map(noteToSession);
      const messageRows = await loadMessageRows(scopedSessions.map((session) => session.id));
      const allMessages = scopedSessions.flatMap((session) =>
        (messageRows.get(session.id) || []).map(rowToMessage)
      );

      return {
        sessions: scopedSessions,
        messages: allMessages
      };
    } catch (error) {
      console.error('AITutorNewService: Exception getting chat data for analytics:', error);
      return { sessions: [], messages: [] };
    }
  }

  /**
   * Staff: list AI Tutor chat notes across students, optionally scoped to a course roster.
   */
  async getStaffChatSessions(options?: {
    courseId?: string | null;
    courseCode?: string | null;
    rosterUserIds?: string[];
  }): Promise<AITutorStaffSession[]> {
    try {
      const courseKeys = courseScopeKeys(options?.courseId, options?.courseCode);
      const rosterUserIds = [...new Set((options?.rosterUserIds || []).filter(Boolean))];
      const byId = new Map<string, AITutorChatNote>();

      const mergeNotes = (rows: AITutorChatNote[] | null | undefined) => {
        (rows || []).forEach((note) => {
          if (note?.id) byId.set(note.id, note);
        });
      };

      if (courseKeys.length > 0) {
        const { data, error } = await supabase
          .from(HINA_SESSIONS)
          .select(STAFF_SESSION_COLUMNS)
          .in('course_id', courseKeys)
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('AITutorNewService: Error fetching staff chat notes by course:', error);
        } else {
          mergeNotes((data || []) as unknown as AITutorChatNote[]);
        }

        if (rosterUserIds.length > 0) {
          const chunkSize = 200;
          for (let i = 0; i < rosterUserIds.length; i += chunkSize) {
            const chunk = rosterUserIds.slice(i, i + chunkSize);
            const { data: untagged, error: untaggedError } = await supabase
              .from(HINA_SESSIONS)
              .select(STAFF_SESSION_COLUMNS)
              .in('user_id', chunk)
              .is('course_id', null)
              .order('updated_at', { ascending: false });
            if (untaggedError) {
              console.warn('AITutorNewService: Untagged staff notes query failed:', untaggedError.message);
              break;
            }
            mergeNotes((untagged || []) as unknown as AITutorChatNote[]);
          }
        }
      } else if (rosterUserIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < rosterUserIds.length; i += chunkSize) {
          const chunk = rosterUserIds.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from(HINA_SESSIONS)
            .select(STAFF_SESSION_COLUMNS)
            .in('user_id', chunk)
            .order('updated_at', { ascending: false });
          if (error) {
            console.error('AITutorNewService: Error fetching staff chat notes by roster:', error);
            break;
          }
          mergeNotes((data || []) as unknown as AITutorChatNote[]);
        }
      } else {
        const { data, error } = await supabase
          .from(HINA_SESSIONS)
          .select(STAFF_SESSION_COLUMNS)
          .order('updated_at', { ascending: false })
          .limit(2000);
        if (error) {
          console.error('AITutorNewService: Error fetching all staff chat notes:', error);
          return [];
        }
        mergeNotes((data || []) as unknown as AITutorChatNote[]);
      }

      const notes = Array.from(byId.values());
      const profiles = await loadUserProfiles(notes.map((note) => note.user_id));
      return notes
        .map((note) => toStaffSession(note, profiles))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } catch (error) {
      console.error('AITutorNewService: Exception getting staff chat sessions:', error);
      return [];
    }
  }

  /**
   * Staff: load full chat notes (with transcripts) for export.
   */
  async getStaffChatNotesByIds(ids: string[]): Promise<AITutorChatNote[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];

    const sessions: AITutorChatNote[] = [];
    const chunkSize = 100;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from(HINA_SESSIONS)
        .select('*')
        .in('id', chunk);
      if (error) {
        console.error('AITutorNewService: Error fetching staff chat notes by id:', error);
        continue;
      }
      sessions.push(...((data || []) as unknown as AITutorChatNote[]));
    }
    const messageRows = await loadMessageRows(sessions.map((session) => session.id));
    return sessions.map((session) => messagesToNote(session, messageRows.get(session.id) || []));
  }

  /**
   * Staff: permanently delete AI Tutor chat notes (and mirrored legacy rows).
   */
  async deleteStaffSessions(ids: string[]): Promise<{ deleted: number; failed: number }> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return { deleted: 0, failed: 0 };

    let deleted = 0;
    let failed = 0;
    const chunkSize = 100;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const { error, count } = await supabase
        .from(HINA_SESSIONS)
        .delete({ count: 'exact' })
        .in('id', chunk);
      if (error) {
        console.error('AITutorNewService: Error deleting staff chat notes:', error);
        failed += chunk.length;
        continue;
      }
      deleted += count ?? chunk.length;
    }

    return { deleted, failed };
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    sessionId: string, 
    userMessage: string, 
    codeRequestCount: number = 0,
    userMetadata?: { detectedStage?: string; messageRole?: string; apiUsed?: string; attachedFileName?: string },
    assistantMetadata?: { detectedStage?: string; messageRole?: string; apiUsed?: string; attachedFileName?: string }
  ): Promise<{
    userMessage: AITutorNewMessage | null;
    aiResponse: AITutorNewMessage | null;
    error?: string;
  }> {
    console.log('AITutorNewService: Starting sendMessage for session:', sessionId, 'codeRequestCount:', codeRequestCount);
    
    try {
      const user = await AuthService.getAuthenticatedUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const userMessageStartTime = new Date();

      // Add user message to database
      console.log('AITutorNewService: Adding user message...');
      const userMsg = await this.addUserMessage(sessionId, userMessage, userMetadata);
      
      if (!userMsg) {
        throw new Error('Failed to save user message');
      }

      // Track user message analysis
      const userAnalysis = AIInteractionAnalyticsService.analyzeMessageContent(userMessage);
      await AIInteractionAnalyticsService.trackMessageAnalysis({
        messageId: userMsg.id,
        sessionId,
        userId: user.id,
        messageRole: 'user',
        messageLength: userMessage.length,
        ...userAnalysis,
      });

      // Track user message token usage
      await AIInteractionAnalyticsService.trackTokenUsage({
        sessionId,
        messageId: userMsg.id,
        userId: user.id,
        messageRole: 'user',
        messageLength: userMessage.length,
        apiUsed: userMetadata?.apiUsed,
      });

      // Generate AI response with code request count
      console.log('AITutorNewService: Generating AI response with codeRequestCount:', codeRequestCount);
      const aiResponseStartTime = new Date();
      const aiResponseText = await this.generateAIResponse(
        sessionId,
        userMessage,
        codeRequestCount,
        'learning'
      );
      const aiResponseEndTime = new Date();
      
      // Add AI response to database with the same turn number as the user message
      console.log('AITutorNewService: Adding AI response with turn number:', userMsg.turn_number);
      const aiMsg = await this.addAssistantMessage(sessionId, aiResponseText, assistantMetadata, userMsg.turn_number);
      
      if (!aiMsg) {
        throw new Error('Failed to save AI response');
      }

      // Track response time
      await AIInteractionAnalyticsService.calculateAndTrackResponseTime(
        { id: userMsg.id, created_at: userMsg.created_at },
        { id: aiMsg.id, created_at: aiMsg.created_at },
        sessionId,
        user.id,
        assistantMetadata?.apiUsed
      );

      // Track AI message analysis
      const aiAnalysis = AIInteractionAnalyticsService.analyzeMessageContent(aiResponseText);
      await AIInteractionAnalyticsService.trackMessageAnalysis({
        messageId: aiMsg.id,
        sessionId,
        userId: user.id,
        messageRole: 'assistant',
        messageLength: aiResponseText.length,
        ...aiAnalysis,
      });

      // Track AI message token usage
      await AIInteractionAnalyticsService.trackTokenUsage({
        sessionId,
        messageId: aiMsg.id,
        userId: user.id,
        messageRole: 'assistant',
        responseLength: aiResponseText.length,
        apiUsed: assistantMetadata?.apiUsed,
      });

      // Get all messages to calculate engagement metrics
      const allMessages = await this.getSessionMessages(sessionId);
      const session = await supabase
        .from(HINA_SESSIONS)
        .select('created_at')
        .eq('id', sessionId)
        .single();

      if (session.data) {
        const engagementMetrics = AIInteractionAnalyticsService.calculateEngagementMetrics(
          allMessages.map(m => ({ role: m.role, created_at: m.created_at })),
          new Date(session.data.created_at)
        );

        await AIInteractionAnalyticsService.trackEngagementMetrics({
          sessionId,
          userId: user.id,
          ...engagementMetrics,
        });
      }

      console.log('AITutorNewService: Message exchange completed successfully');
      return {
        userMessage: userMsg,
        aiResponse: aiMsg
      };
      
    } catch (error) {
      console.error('AITutorNewService: Error in sendMessage:', error);
      
      return {
        userMessage: null,
        aiResponse: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}