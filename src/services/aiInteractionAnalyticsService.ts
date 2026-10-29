import { supabase } from '../lib/supabase';

/**
 * Comprehensive AI Interaction Analytics Service
 * Tracks all aspects of AI-student interactions for analytics
 */

export interface ResponseTimeData {
  sessionId: string;
  messageId: string;
  userId: string;
  userMessageId?: string;
  responseTimeMs: number;
  userMessageTimestamp: Date;
  aiResponseTimestamp: Date;
  apiUsed?: string;
}

export interface TokenUsageData {
  sessionId: string;
  messageId: string;
  userId: string;
  messageRole: 'user' | 'assistant';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  apiUsed?: string;
  messageLength?: number;
  responseLength?: number;
}

export interface EngagementMetricsData {
  sessionId: string;
  userId: string;
  timeBetweenMessagesSeconds?: number;
  studentResponseTimeSeconds?: number;
  sessionAbandoned?: boolean;
  abandonmentTimestamp?: Date;
  conversationDepth?: number;
  peakUsageHour?: number;
  sessionDurationSeconds?: number;
  messagesPerMinute?: number;
}

export interface MessageAnalysisData {
  messageId: string;
  sessionId: string;
  userId: string;
  messageRole: 'user' | 'assistant';
  messageLength: number;
  wordCount?: number;
  codeRatio?: number;
  codeBlockCount?: number;
  questionType?: 'debugging' | 'conceptual' | 'planning' | 'syntax' | 'logic' | 'general' | 'other';
  sentimentScore?: number;
  sentimentLabel?: 'positive' | 'negative' | 'neutral' | 'frustrated' | 'confident';
  hasCode?: boolean;
  hasFormula?: boolean;
  hasLink?: boolean;
  languageDetected?: string;
  complexityScore?: number;
}

export interface ScaffoldingTrackingData {
  sessionId: string;
  userId: string;
  fromScaffoldingLevel?: 'minimal' | 'moderate' | 'high';
  toScaffoldingLevel?: 'minimal' | 'moderate' | 'high';
  hintTier?: number;
  hintProgressionPath?: number[];
  changeReason?: string;
  completionRate?: number;
}

export interface LearningCorrelationData {
  userId: string;
  sessionId: string;
  activityType: 'assignment_submission' | 'quiz_attempt' | 'group_project' | 'ethics_session';
  activityId?: string;
  activityTable?: string;
  correlationType: 'before' | 'during' | 'after';
  timeDifferenceSeconds?: number;
  aiInteractionsCount?: number;
}

export interface UIInteractionData {
  userId: string;
  sessionId?: string;
  interactionType: 'widget_open' | 'widget_close' | 'widget_minimize' | 'widget_maximize' | 'widget_resize' | 'widget_move' | 'widget_position_change';
  widgetPosition?: { left: number; top: number };
  widgetSize?: { width: number; height: number };
  viewportSize?: { width: number; height: number };
  interactionMetadata?: Record<string, any>;
}

export class AIInteractionAnalyticsService {
  // ============================================================================
  // RESPONSE TIME TRACKING
  // ============================================================================

  /**
   * Track AI response time
   */
  static async trackResponseTime(data: ResponseTimeData): Promise<{ error: any }> {
    try {
      const { error } = await supabase
        .from('ai_response_times')
        .insert({
          session_id: data.sessionId,
          message_id: data.messageId,
          user_id: data.userId,
          user_message_id: data.userMessageId,
          response_time_ms: data.responseTimeMs,
          user_message_timestamp: data.userMessageTimestamp.toISOString(),
          ai_response_timestamp: data.aiResponseTimestamp.toISOString(),
          api_used: data.apiUsed,
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking response time:', error);
      return { error };
    }
  }

  /**
   * Calculate and track response time from two messages
   */
  static async calculateAndTrackResponseTime(
    userMessage: { id: string; created_at: string },
    aiMessage: { id: string; created_at: string },
    sessionId: string,
    userId: string,
    apiUsed?: string
  ): Promise<{ error: any }> {
    try {
      const userTime = new Date(userMessage.created_at).getTime();
      const aiTime = new Date(aiMessage.created_at).getTime();
      const responseTimeMs = aiTime - userTime;

      if (responseTimeMs > 0 && responseTimeMs < 300000) { // Valid response time (0-5 minutes)
        return await this.trackResponseTime({
          sessionId,
          messageId: aiMessage.id,
          userId,
          userMessageId: userMessage.id,
          responseTimeMs,
          userMessageTimestamp: new Date(userMessage.created_at),
          aiResponseTimestamp: new Date(aiMessage.created_at),
          apiUsed,
        });
      }

      return { error: null };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error calculating response time:', error);
      return { error };
    }
  }

  // ============================================================================
  // TOKEN USAGE TRACKING
  // ============================================================================

  /**
   * Estimate tokens from text (rough estimate: ~4 characters per token)
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost based on API and tokens
   */
  static estimateCost(
    apiUsed: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    // Rough cost estimates per 1K tokens (in USD)
    const costPer1K: Record<string, { input: number; output: number }> = {
      'gemini-3': { input: 0.075, output: 0.30 }, // Gemini 2.0 Flash
      'gemini-2': { input: 0.075, output: 0.30 }, // Gemini 1.5 Flash
      'claude': { input: 0.15, output: 0.75 }, // Claude 3.5 Sonnet
      'gpt-4': { input: 0.03, output: 0.06 }, // GPT-4 Turbo
      'grok': { input: 0.01, output: 0.01 }, // Grok (estimated)
    };

    const pricing = costPer1K[apiUsed] || { input: 0.05, output: 0.15 };
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Track token usage
   */
  static async trackTokenUsage(data: TokenUsageData): Promise<{ error: any }> {
    try {
      // If tokens not provided, estimate from message length
      let inputTokens = data.inputTokens;
      let outputTokens = data.outputTokens;
      let totalTokens = data.totalTokens;

      if (!inputTokens && data.messageLength) {
        inputTokens = this.estimateTokens(data.messageLength.toString());
      }
      if (!outputTokens && data.responseLength) {
        outputTokens = this.estimateTokens(data.responseLength.toString());
      }
      if (!totalTokens && inputTokens && outputTokens) {
        totalTokens = inputTokens + outputTokens;
      }

      // Estimate cost if API is known
      let estimatedCost = data.estimatedCostUsd;
      if (!estimatedCost && data.apiUsed && inputTokens && outputTokens) {
        estimatedCost = this.estimateCost(data.apiUsed, inputTokens, outputTokens);
      }

      const { error } = await supabase
        .from('ai_token_usage')
        .insert({
          session_id: data.sessionId,
          message_id: data.messageId,
          user_id: data.userId,
          message_role: data.messageRole,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          estimated_cost_usd: estimatedCost,
          api_used: data.apiUsed,
          message_length: data.messageLength,
          response_length: data.responseLength,
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking token usage:', error);
      return { error };
    }
  }

  // ============================================================================
  // ENGAGEMENT METRICS TRACKING
  // ============================================================================

  /**
   * Mark a session as abandoned
   */
  static async markSessionAbandoned(
    sessionId: string,
    userId: string,
    abandonmentTimestamp?: Date
  ): Promise<{ error: any }> {
    try {
      const { data: existing } = await supabase
        .from('ai_engagement_metrics')
        .select('id')
        .eq('session_id', sessionId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('ai_engagement_metrics')
          .update({
            session_abandoned: true,
            abandonment_timestamp: (abandonmentTimestamp || new Date()).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        return { error };
      } else {
        // Create new metrics with abandonment
        const { error } = await supabase
          .from('ai_engagement_metrics')
          .insert({
            session_id: sessionId,
            user_id: userId,
            session_abandoned: true,
            abandonment_timestamp: (abandonmentTimestamp || new Date()).toISOString(),
          });

        return { error };
      }
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error marking session as abandoned:', error);
      return { error };
    }
  }

  /**
   * Track or update engagement metrics
   */
  static async trackEngagementMetrics(data: EngagementMetricsData): Promise<{ error: any }> {
    try {
      // Check if metrics already exist for this session
      const { data: existing } = await supabase
        .from('ai_engagement_metrics')
        .select('id')
        .eq('session_id', data.sessionId)
        .single();

      if (existing) {
        // Update existing metrics
        const { error } = await supabase
          .from('ai_engagement_metrics')
          .update({
            time_between_messages_seconds: data.timeBetweenMessagesSeconds,
            student_response_time_seconds: data.studentResponseTimeSeconds,
            session_abandoned: data.sessionAbandoned,
            abandonment_timestamp: data.abandonmentTimestamp?.toISOString(),
            conversation_depth: data.conversationDepth,
            peak_usage_hour: data.peakUsageHour,
            session_duration_seconds: data.sessionDurationSeconds,
            messages_per_minute: data.messagesPerMinute,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        return { error };
      } else {
        // Create new metrics
        const { error } = await supabase
          .from('ai_engagement_metrics')
          .insert({
            session_id: data.sessionId,
            user_id: data.userId,
            time_between_messages_seconds: data.timeBetweenMessagesSeconds,
            student_response_time_seconds: data.studentResponseTimeSeconds,
            session_abandoned: data.sessionAbandoned,
            abandonment_timestamp: data.abandonmentTimestamp?.toISOString(),
            conversation_depth: data.conversationDepth,
            peak_usage_hour: data.peakUsageHour,
            session_duration_seconds: data.sessionDurationSeconds,
            messages_per_minute: data.messagesPerMinute,
          });

        return { error };
      }
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking engagement metrics:', error);
      return { error };
    }
  }

  /**
   * Calculate engagement metrics from messages
   */
  static calculateEngagementMetrics(
    messages: Array<{ role: string; created_at: string }>,
    sessionStartTime: Date,
    sessionEndTime?: Date
  ): Partial<EngagementMetricsData> {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // Calculate time between messages
    const timeBetweenMessages: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      const prevTime = new Date(messages[i - 1].created_at).getTime();
      const currTime = new Date(messages[i].created_at).getTime();
      timeBetweenMessages.push(Math.floor((currTime - prevTime) / 1000));
    }

    // Calculate student response times (time from AI message to user response)
    const studentResponseTimes: number[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'assistant' && messages[i + 1].role === 'user') {
        const aiTime = new Date(messages[i].created_at).getTime();
        const userTime = new Date(messages[i + 1].created_at).getTime();
        studentResponseTimes.push(Math.floor((userTime - aiTime) / 1000));
      }
    }

    // Calculate session duration
    const endTime = sessionEndTime || new Date();
    const sessionDurationSeconds = Math.floor(
      (endTime.getTime() - sessionStartTime.getTime()) / 1000
    );

    // Calculate messages per minute
    const messagesPerMinute = sessionDurationSeconds > 0
      ? (messages.length / (sessionDurationSeconds / 60))
      : 0;

    // Get peak usage hour
    const peakUsageHour = new Date(sessionStartTime).getHours();

    return {
      timeBetweenMessagesSeconds: timeBetweenMessages.length > 0
        ? Math.floor(timeBetweenMessages.reduce((a, b) => a + b, 0) / timeBetweenMessages.length)
        : undefined,
      studentResponseTimeSeconds: studentResponseTimes.length > 0
        ? Math.floor(studentResponseTimes.reduce((a, b) => a + b, 0) / studentResponseTimes.length)
        : undefined,
      conversationDepth: messages.length,
      peakUsageHour,
      sessionDurationSeconds,
      messagesPerMinute: Math.round(messagesPerMinute * 100) / 100,
    };
  }

  // ============================================================================
  // CONTENT ANALYSIS
  // ============================================================================

  /**
   * Analyze message content
   */
  static analyzeMessageContent(content: string): Partial<MessageAnalysisData> {
    const messageLength = content.length;
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Detect code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockRegex) || [];
    const codeBlockCount = codeBlocks.length;
    const codeText = codeBlocks.join('');
    const codeRatio = messageLength > 0 ? codeText.length / messageLength : 0;
    const hasCode = codeBlockCount > 0 || /`[^`]+`/.test(content);

    // Detect formulas (LaTeX)
    const hasFormula = /\$[^$]+\$/.test(content) || /\$\$[\s\S]*?\$\$/.test(content);

    // Detect links
    const hasLink = /https?:\/\/[^\s]+/.test(content);

    // Detect question type
    const lowerContent = content.toLowerCase();
    let questionType: MessageAnalysisData['questionType'] = 'general';
    if (lowerContent.includes('error') || lowerContent.includes('bug') || lowerContent.includes('debug')) {
      questionType = 'debugging';
    } else if (lowerContent.includes('explain') || lowerContent.includes('what is') || lowerContent.includes('how does') || lowerContent.includes('why')) {
      questionType = 'conceptual';
    } else if (lowerContent.includes('plan') || lowerContent.includes('strategy') || lowerContent.includes('approach')) {
      questionType = 'planning';
    } else if (lowerContent.includes('syntax') || lowerContent.includes('grammar') || lowerContent.includes('format')) {
      questionType = 'syntax';
    } else if (lowerContent.includes('logic') || lowerContent.includes('algorithm') || lowerContent.includes('reasoning')) {
      questionType = 'logic';
    }

    // Simple sentiment analysis (basic keyword-based)
    let sentimentScore = 0;
    let sentimentLabel: MessageAnalysisData['sentimentLabel'] = 'neutral';
    
    const positiveWords = ['good', 'great', 'excellent', 'thanks', 'thank you', 'helpful', 'understand', 'clear', 'perfect', 'awesome', 'love', 'amazing'];
    const negativeWords = ['bad', 'wrong', 'error', 'fail', 'stuck', 'confused', 'frustrated', 'difficult', 'hard', 'problem', 'issue', 'broken'];
    const frustratedWords = ['stuck', 'frustrated', 'confused', 'not working', 'still', 'again', 'help'];
    const confidentWords = ['think', 'believe', 'maybe', 'should', 'could', 'would', 'understand'];

    const lowerWords = lowerContent.split(/\s+/);
    const positiveCount = lowerWords.filter(w => positiveWords.some(pw => w.includes(pw))).length;
    const negativeCount = lowerWords.filter(w => negativeWords.some(nw => w.includes(nw))).length;
    const frustratedCount = lowerWords.filter(w => frustratedWords.some(fw => w.includes(fw))).length;
    const confidentCount = lowerWords.filter(w => confidentWords.some(cw => w.includes(cw))).length;

    if (frustratedCount > 0) {
      sentimentLabel = 'frustrated';
      sentimentScore = -0.5;
    } else if (confidentCount > 2) {
      sentimentLabel = 'confident';
      sentimentScore = 0.7;
    } else if (positiveCount > negativeCount) {
      sentimentLabel = 'positive';
      sentimentScore = 0.5;
    } else if (negativeCount > positiveCount) {
      sentimentLabel = 'negative';
      sentimentScore = -0.3;
    }

    // Estimate complexity (simple heuristic)
    const complexityScore = Math.min(100, Math.max(0,
      (wordCount * 0.5) +
      (codeBlockCount * 10) +
      (hasFormula ? 15 : 0) +
      (questionType === 'conceptual' ? 20 : questionType === 'debugging' ? 15 : 10)
    ));

    return {
      messageLength,
      wordCount,
      codeRatio: Math.round(codeRatio * 10000) / 10000,
      codeBlockCount,
      questionType,
      sentimentScore: Math.round(sentimentScore * 10000) / 10000,
      sentimentLabel,
      hasCode,
      hasFormula,
      hasLink,
      complexityScore: Math.round(complexityScore * 100) / 100,
    };
  }

  /**
   * Track message analysis
   */
  static async trackMessageAnalysis(data: MessageAnalysisData): Promise<{ error: any }> {
    try {
      const { error } = await supabase
        .from('ai_message_analysis')
        .insert({
          message_id: data.messageId,
          session_id: data.sessionId,
          user_id: data.userId,
          message_role: data.messageRole,
          message_length: data.messageLength,
          word_count: data.wordCount,
          code_ratio: data.codeRatio,
          code_block_count: data.codeBlockCount,
          question_type: data.questionType,
          sentiment_score: data.sentimentScore,
          sentiment_label: data.sentimentLabel,
          has_code: data.hasCode,
          has_formula: data.hasFormula,
          has_link: data.hasLink,
          complexity_score: data.complexityScore,
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking message analysis:', error);
      return { error };
    }
  }

  // ============================================================================
  // SCAFFOLDING TRACKING
  // ============================================================================

  /**
   * Track scaffolding changes
   */
  static async trackScaffolding(data: ScaffoldingTrackingData): Promise<{ error: any }> {
    try {
      const { error } = await supabase
        .from('ai_scaffolding_tracking')
        .insert({
          session_id: data.sessionId,
          user_id: data.userId,
          from_scaffolding_level: data.fromScaffoldingLevel,
          to_scaffolding_level: data.toScaffoldingLevel,
          hint_tier: data.hintTier,
          hint_progression_path: data.hintProgressionPath,
          change_reason: data.changeReason,
          completion_rate: data.completionRate,
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking scaffolding:', error);
      return { error };
    }
  }

  // ============================================================================
  // CROSS-PLATFORM CORRELATION
  // ============================================================================

  /**
   * Track correlation between AI interactions and other activities
   */
  static async trackLearningCorrelation(data: LearningCorrelationData): Promise<{ error: any }> {
    try {
      const { error } = await supabase
        .from('ai_learning_correlations')
        .insert({
          user_id: data.userId,
          session_id: data.sessionId,
          activity_type: data.activityType,
          activity_id: data.activityId,
          activity_table: data.activityTable,
          correlation_type: data.correlationType,
          time_difference_seconds: data.timeDifferenceSeconds,
          ai_interactions_count: data.aiInteractionsCount,
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking learning correlation:', error);
      return { error };
    }
  }

  /**
   * Find and correlate AI interactions with a specific activity
   * This should be called when an activity (assignment, quiz, etc.) is created or updated
   */
  static async correlateActivityWithAIInteractions(
    userId: string,
    activityType: LearningCorrelationData['activityType'],
    activityId: string,
    activityTable: string,
    activityTimestamp: Date,
    timeWindowSeconds: number = 3600 // Default: 1 hour before/after
  ): Promise<{ error: any }> {
    try {
      // Find AI sessions that occurred around this activity
      const windowStart = new Date(activityTimestamp.getTime() - timeWindowSeconds * 1000);
      const windowEnd = new Date(activityTimestamp.getTime() + timeWindowSeconds * 1000);

      // Get AI sessions in the time window
      const { data: sessions, error: sessionsError } = await supabase
        .from('HINA_chat_sessions')
        .select('id, created_at, updated_at')
        .eq('user_id', userId)
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString());

      if (sessionsError) {
        return { error: sessionsError };
      }

      // For each session, determine correlation type and track it
      for (const session of sessions || []) {
        const sessionStart = new Date(session.created_at);
        const sessionEnd = session.updated_at ? new Date(session.updated_at) : new Date();
        const activityTime = activityTimestamp.getTime();

        let correlationType: 'before' | 'during' | 'after';
        let timeDifferenceSeconds: number;

        if (activityTime < sessionStart.getTime()) {
          // Activity happened before session
          correlationType = 'before';
          timeDifferenceSeconds = Math.floor((sessionStart.getTime() - activityTime) / 1000);
        } else if (activityTime >= sessionStart.getTime() && activityTime <= sessionEnd.getTime()) {
          // Activity happened during session
          correlationType = 'during';
          timeDifferenceSeconds = 0;
        } else {
          // Activity happened after session
          correlationType = 'after';
          timeDifferenceSeconds = Math.floor((activityTime - sessionEnd.getTime()) / 1000);
        }

        // Count AI interactions in this session
        const { data: messages } = await supabase
          .from('HINA_chat_messages')
          .select('id')
          .eq('session_id', session.id);

        await this.trackLearningCorrelation({
          userId,
          sessionId: session.id,
          activityType,
          activityId,
          activityTable,
          correlationType,
          timeDifferenceSeconds,
          aiInteractionsCount: messages?.length || 0,
        });
      }

      return { error: null };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error correlating activity:', error);
      return { error };
    }
  }

  // ============================================================================
  // UI INTERACTION TRACKING
  // ============================================================================

  /**
   * Track UI interactions
   */
  static async trackUIInteraction(data: UIInteractionData): Promise<{ error: any }> {
    try {
      const { error } = await supabase
        .from('ai_ui_interactions')
        .insert({
          user_id: data.userId,
          session_id: data.sessionId,
          interaction_type: data.interactionType,
          widget_position: data.widgetPosition,
          widget_size: data.widgetSize,
          viewport_size: data.viewportSize,
          interaction_metadata: data.interactionMetadata || {},
        });

      return { error };
    } catch (error) {
      console.error('[AIInteractionAnalyticsService] Error tracking UI interaction:', error);
      return { error };
    }
  }
}
