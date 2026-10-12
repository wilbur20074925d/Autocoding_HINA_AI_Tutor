import { supabase } from '../lib/supabase';

export interface LearningProcessCalculation {
  id: string;
  session_id: string;
  message_id?: string | null;
  user_id: string;
  prompt_text: string;
  step1_segmentation: any[];
  step2_sentiment: any;
  step3_stage_tagging: any[];
  step4_aggregation: any;
  step5_emotion_adjustment: any;
  step6_smoothing: any;
  final_scores: Record<string, number>;
  session_level: any;
  calculation_version?: string;
  calculation_parameters?: any;
  created_at: string;
  updated_at: string;
}

export interface CalculationSteps {
  prompt: string;
  step1_segmentation: Array<{ segment: string; start: number; end: number }>;
  step2_sentiment: {
    sentiment_score: number;
    confusion_score: number;
    frustration_score: number;
    engagement_score: number;
  };
  step3_stageTagging: Array<{
    segment: string;
    stages: Record<string, { p: number; intensity: number }>;
    cognitive_vs_metacognitive: { cognitive: number; metacognitive: number };
  }>;
  step4_aggregation: Record<string, { raw_score: number; normalized_score: number; weight: number }>;
  step5_emotionAdjustment: Record<string, { before: number; after: number; adjustment_factor: number }>;
  step6_smoothing: Record<string, { current: number; previous: number; smoothed: number; lambda: number }>;
  final_scores: Record<string, number>;
  session_level: {
    contribution: Record<string, number>;
    ema_trend: Record<string, number>;
    transition_bonus: Record<string, number>;
    final_session_score: Record<string, number>;
  };
}

export class LearningProcessService {
  private static instance: LearningProcessService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): LearningProcessService {
    if (!LearningProcessService.instance) {
      LearningProcessService.instance = new LearningProcessService();
    }
    return LearningProcessService.instance;
  }

  /**
   * Save calculation data to Supabase
   */
  async saveCalculation(
    sessionId: string,
    messageId: string | null,
    userId: string,
    calculationSteps: CalculationSteps,
    calculationParams?: { alpha?: number; beta?: number; lambda?: number }
  ): Promise<LearningProcessCalculation | null> {
    try {
      if (!supabase) {
        console.error('LearningProcessService: Supabase client not initialized');
        return null;
      }

      const calculationData = {
        session_id: sessionId,
        message_id: messageId,
        user_id: userId,
        prompt_text: calculationSteps.prompt,
        step1_segmentation: calculationSteps.step1_segmentation,
        step2_sentiment: calculationSteps.step2_sentiment,
        step3_stage_tagging: calculationSteps.step3_stageTagging,
        step4_aggregation: calculationSteps.step4_aggregation,
        step5_emotion_adjustment: calculationSteps.step5_emotionAdjustment,
        step6_smoothing: calculationSteps.step6_smoothing,
        final_scores: calculationSteps.final_scores,
        session_level: calculationSteps.session_level,
        calculation_version: '1.0',
        calculation_parameters: calculationParams || {}
      };

      const { data, error } = await supabase
        .from('learning_process_calculations')
        .insert(calculationData)
        .select()
        .single();

      if (error) {
        console.error('LearningProcessService: Error saving calculation:', error);
        return null;
      }

      console.log('LearningProcessService: Calculation saved successfully:', data.id);
      return data as LearningProcessCalculation;
    } catch (error) {
      console.error('LearningProcessService: Exception saving calculation:', error);
      return null;
    }
  }

  /**
   * Get all calculations for a session
   */
  async getCalculationsBySession(sessionId: string): Promise<LearningProcessCalculation[]> {
    try {
      if (!supabase) {
        console.error('LearningProcessService: Supabase client not initialized');
        return [];
      }

      const { data, error } = await supabase
        .from('learning_process_calculations')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('LearningProcessService: Error fetching calculations:', error);
        return [];
      }

      return (data || []) as LearningProcessCalculation[];
    } catch (error) {
      console.error('LearningProcessService: Exception fetching calculations:', error);
      return [];
    }
  }

  /**
   * Get calculation by ID
   */
  async getCalculationById(calculationId: string): Promise<LearningProcessCalculation | null> {
    try {
      if (!supabase) {
        console.error('LearningProcessService: Supabase client not initialized');
        return null;
      }

      const { data, error } = await supabase
        .from('learning_process_calculations')
        .select('*')
        .eq('id', calculationId)
        .single();

      if (error) {
        console.error('LearningProcessService: Error fetching calculation:', error);
        return null;
      }

      return data as LearningProcessCalculation;
    } catch (error) {
      console.error('LearningProcessService: Exception fetching calculation:', error);
      return null;
    }
  }

  /**
   * Get latest calculation for a session
   */
  async getLatestCalculation(sessionId: string): Promise<LearningProcessCalculation | null> {
    try {
      if (!supabase) {
        console.error('LearningProcessService: Supabase client not initialized');
        return null;
      }

      const { data, error } = await supabase
        .from('learning_process_calculations')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('LearningProcessService: Error fetching latest calculation:', error);
        return null;
      }

      return data as LearningProcessCalculation;
    } catch (error) {
      console.error('LearningProcessService: Exception fetching latest calculation:', error);
      return null;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(sessionId: string): Promise<any> {
    try {
      if (!supabase) {
        console.error('LearningProcessService: Supabase client not initialized');
        return null;
      }

      const { data, error } = await supabase
        .from('learning_process_session_stats')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error) {
        console.error('LearningProcessService: Error fetching session statistics:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('LearningProcessService: Exception fetching session statistics:', error);
      return null;
    }
  }

  /**
   * Convert database record to CalculationSteps format
   */
  convertToCalculationSteps(record: LearningProcessCalculation): CalculationSteps {
    return {
      prompt: record.prompt_text,
      step1_segmentation: record.step1_segmentation,
      step2_sentiment: record.step2_sentiment,
      step3_stageTagging: record.step3_stage_tagging,
      step4_aggregation: record.step4_aggregation,
      step5_emotionAdjustment: record.step5_emotion_adjustment,
      step6_smoothing: record.step6_smoothing,
      final_scores: record.final_scores,
      session_level: record.session_level
    };
  }
}
