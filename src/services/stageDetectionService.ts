import { GeminiService } from './geminiService';

export type CognitiveStage = 'Clarify' | 'Plan' | 'Execute' | 'Verify' | 'Reflect';
export type StageProbabilityVector = {
  Clarify: number;
  Plan: number;
  Execute: number;
  Verify: number;
  Reflect: number;
};

export interface UserMessage {
  id: string;
  content: string;
  timestamp: Date;
  turnNumber?: number;
}

export interface MessageAnalysisResult {
  message: UserMessage;
  ruleBasedScores: StageProbabilityVector;
  semanticScores: StageProbabilityVector;
  fusedProbabilities: StageProbabilityVector;
  smoothedProbabilities: StageProbabilityVector;
  weight: number; // Time, token, and event-based weight
}

/**
 * Stage Detection Service implementing probabilistic multi-layer inference model
 * Based on the specification: Stage Percentage Detection — Design Specification
 */
export class StageDetectionService {
  private static instance: StageDetectionService;
  
  // Stage prototypes for semantic similarity
  private static readonly STAGE_PROTOTYPES: Record<CognitiveStage, string> = {
    Clarify: 'Clarify: asking for understanding',
    Plan: 'Plan: outlining an approach',
    Execute: 'Execute: implementing or debugging',
    Verify: 'Verify: testing correctness',
    Reflect: 'Reflect: summarizing learning'
  };

  // Rule-based keyword patterns for each stage
  private static readonly STAGE_PATTERNS: Record<CognitiveStage, RegExp[]> = {
    Clarify: [
      /\b(what|how|why|can you explain|help me understand|i don't understand|confused|clarify|what does|explain|unclear|not sure|what is|tell me about)\b/i,
      /\b(meaning|definition|concept|idea|understand|grasp|comprehend)\b/i
    ],
    Plan: [
      /\b(plan|approach|strategy|steps|design|outline|algorithm|pseudocode|how should i|what steps|create a plan|maybe i should|i think i'll|i'll try|strategy|method)\b/i,
      /\b(prepare|organize|structure|roadmap|blueprint|framework)\b/i
    ],
    Execute: [
      /\b(code|implement|write|creating|building|coding|program|syntax|function|variable|loop|if|running|executed|output|result|i ran|i created|i wrote|i built)\b/i,
      /\b(error message|exception|traceback|bug|crash|runtime|compile)\b/i
    ],
    Verify: [
      /\b(test|tested|error|bug|debug|wrong|not working|incorrect|verify|check|validate|troubleshoot|issue|i checked|it worked|doesn't work|is this correct|compare)\b/i,
      /\b(fix|repair|correct|validate|confirm|ensure|double-check)\b/i
    ],
    Reflect: [
      /\b(learned|understand|summary|reflection|insight|realized|takeaway|lesson|improved|better now|i learned|next time|i realized|i see now|i understand|key insight)\b/i,
      /\b(conclusion|summary|main point|takeaway|what i learned|how i improved)\b/i
    ]
  };

  // Configuration parameters
  private static readonly LAMBDA = 0.5; // Weight between rule-based and semantic (0-1)
  private static readonly BETA = 0.7; // Temporal smoothing factor (0.6-0.8)

  private constructor() {}

  static getInstance(): StageDetectionService {
    if (!StageDetectionService.instance) {
      StageDetectionService.instance = new StageDetectionService();
    }
    return StageDetectionService.instance;
  }

  /**
   * Step 1: Rule-Based Prior
   * Scans message for linguistic and structural signals
   */
  private calculateRuleBasedScores(message: string): StageProbabilityVector {
    const lowerMessage = message.toLowerCase();
    const scores: Partial<StageProbabilityVector> = {};

    // Calculate raw scores for each stage
    const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
    
    stages.forEach(stage => {
      let rawScore = 0;
      StageDetectionService.STAGE_PATTERNS[stage].forEach(pattern => {
        const matches = lowerMessage.match(pattern);
        if (matches) {
          rawScore += matches.length; // Count matches
        }
      });
      
      // Additional scoring based on message characteristics
      if (stage === 'Clarify' && (lowerMessage.includes('?') || lowerMessage.includes('what') || lowerMessage.includes('how'))) {
        rawScore += 2;
      }
      if (stage === 'Execute' && (lowerMessage.includes('error') || lowerMessage.includes('output') || lowerMessage.includes('ran'))) {
        rawScore += 2;
      }
      if (stage === 'Verify' && (lowerMessage.includes('test') || lowerMessage.includes('check') || lowerMessage.includes('work'))) {
        rawScore += 2;
      }
      if (stage === 'Reflect' && (lowerMessage.includes('learned') || lowerMessage.includes('understand') || lowerMessage.includes('realized'))) {
        rawScore += 2;
      }

      scores[stage] = rawScore;
    });

    // Normalize to probability vector (sum to 1)
    const totalScore = Object.values(scores).reduce((sum, val) => sum + (val || 0), 0);
    
    const normalized: StageProbabilityVector = {
      Clarify: totalScore > 0 ? (scores.Clarify || 0) / totalScore : 0.2,
      Plan: totalScore > 0 ? (scores.Plan || 0) / totalScore : 0.2,
      Execute: totalScore > 0 ? (scores.Execute || 0) / totalScore : 0.2,
      Verify: totalScore > 0 ? (scores.Verify || 0) / totalScore : 0.2,
      Reflect: totalScore > 0 ? (scores.Reflect || 0) / totalScore : 0.2
    };

    // If no matches, return uniform distribution
    if (totalScore === 0) {
      return {
        Clarify: 0.2,
        Plan: 0.2,
        Execute: 0.2,
        Verify: 0.2,
        Reflect: 0.2
      };
    }

    return normalized;
  }

  /**
   * Step 2: Semantic Similarity Scoring
   * Uses Gemini to compute similarity with stage prototypes
   */
  private async calculateSemanticScores(message: string): Promise<StageProbabilityVector> {
    try {
      // Use Gemini to get semantic similarity scores
      // Since direct embeddings might not be available, we'll use a prompt-based approach
      const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
      
      // Create a prompt to analyze semantic similarity
      const similarityPrompt = `Analyze the following user message and rate how well it matches each cognitive stage prototype (0.0 to 1.0). Return a JSON object with scores for each stage.

USER MESSAGE: "${message}"

STAGE PROTOTYPES:
- Clarify: "asking for understanding"
- Plan: "outlining an approach"
- Execute: "implementing or debugging"
- Verify: "testing correctness"
- Reflect: "summarizing learning"

Return ONLY a valid JSON object in this exact format:
{"Clarify": 0.0-1.0, "Plan": 0.0-1.0, "Execute": 0.0-1.0, "Verify": 0.0-1.0, "Reflect": 0.0-1.0}

The scores should sum to approximately 1.0.`;

      const response = await this.getGeminiEmbeddingSimilarity(message);
      
      // Normalize to ensure valid probability distribution
      const total = Object.values(response).reduce((sum, val) => sum + Math.max(0, val), 0);
      
      if (total === 0) {
        // Fallback to uniform if parsing fails
        return {
          Clarify: 0.2,
          Plan: 0.2,
          Execute: 0.2,
          Verify: 0.2,
          Reflect: 0.2
        };
      }

      return {
        Clarify: Math.max(0, response.Clarify || 0) / total,
        Plan: Math.max(0, response.Plan || 0) / total,
        Execute: Math.max(0, response.Execute || 0) / total,
        Verify: Math.max(0, response.Verify || 0) / total,
        Reflect: Math.max(0, response.Reflect || 0) / total
      };
    } catch (error) {
      console.error('Error calculating semantic scores:', error);
      // Fallback to rule-based only
      return this.calculateRuleBasedScores(message);
    }
  }

  /**
   * Helper method to get semantic similarity using Gemini
   */
  private async getGeminiEmbeddingSimilarity(message: string): Promise<StageProbabilityVector> {
    try {
      const similarityPrompt = `Analyze this message and rate semantic similarity to each cognitive stage (0.0-1.0, sum ≈ 1.0):

"${message}"

Stages:
- Clarify: asking for understanding
- Plan: outlining an approach  
- Execute: implementing or debugging
- Verify: testing correctness
- Reflect: summarizing learning

Return ONLY valid JSON: {"Clarify": number, "Plan": number, "Execute": number, "Verify": number, "Reflect": number}`;

      const response = await GeminiService.generateContent(similarityPrompt);
      
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          Clarify: parseFloat(parsed.Clarify) || 0.2,
          Plan: parseFloat(parsed.Plan) || 0.2,
          Execute: parseFloat(parsed.Execute) || 0.2,
          Verify: parseFloat(parsed.Verify) || 0.2,
          Reflect: parseFloat(parsed.Reflect) || 0.2
        };
      }
      
      // Fallback parsing
      const scores: StageProbabilityVector = {
        Clarify: this.extractScore(response, 'Clarify'),
        Plan: this.extractScore(response, 'Plan'),
        Execute: this.extractScore(response, 'Execute'),
        Verify: this.extractScore(response, 'Verify'),
        Reflect: this.extractScore(response, 'Reflect')
      };

      // Normalize
      const total = Object.values(scores).reduce((sum, val) => sum + val, 0);
      if (total === 0) {
        return { Clarify: 0.2, Plan: 0.2, Execute: 0.2, Verify: 0.2, Reflect: 0.2 };
      }

      return {
        Clarify: scores.Clarify / total,
        Plan: scores.Plan / total,
        Execute: scores.Execute / total,
        Verify: scores.Verify / total,
        Reflect: scores.Reflect / total
      };
    } catch (error) {
      console.error('Error in Gemini embedding similarity:', error);
      // Return uniform distribution as fallback
      return { Clarify: 0.2, Plan: 0.2, Execute: 0.2, Verify: 0.2, Reflect: 0.2 };
    }
  }

  private extractScore(text: string, stage: string): number {
    const regex = new RegExp(`${stage}[":\\s]+([0-9.]+)`, 'i');
    const match = text.match(regex);
    return match ? parseFloat(match[1]) : 0.2;
  }

  /**
   * Step 3: Fusion of Prior and Likelihood
   * Merges rule-based and semantic scores with weighted formula
   */
  private fuseProbabilities(
    ruleBased: StageProbabilityVector,
    semantic: StageProbabilityVector
  ): StageProbabilityVector {
    const lambda = StageDetectionService.LAMBDA;
    const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
    
    // Calculate fused scores: (r^λ) * (q^(1-λ))
    const fusedScores: Partial<StageProbabilityVector> = {};
    let sum = 0;

    stages.forEach(stage => {
      const r = Math.max(0.0001, ruleBased[stage]); // Avoid zero
      const q = Math.max(0.0001, semantic[stage]);
      
      const fused = Math.pow(r, lambda) * Math.pow(q, 1 - lambda);
      fusedScores[stage] = fused;
      sum += fused;
    });

    // Normalize
    return {
      Clarify: (fusedScores.Clarify || 0) / sum,
      Plan: (fusedScores.Plan || 0) / sum,
      Execute: (fusedScores.Execute || 0) / sum,
      Verify: (fusedScores.Verify || 0) / sum,
      Reflect: (fusedScores.Reflect || 0) / sum
    };
  }

  /**
   * Step 4: Temporal Smoothing
   * Applies exponential smoothing to avoid noisy switching
   */
  private applyTemporalSmoothing(
    currentProbabilities: StageProbabilityVector,
    previousProbabilities: StageProbabilityVector | null
  ): StageProbabilityVector {
    if (!previousProbabilities) {
      return currentProbabilities;
    }

    const beta = StageDetectionService.BETA;
    const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];

    return {
      Clarify: beta * currentProbabilities.Clarify + (1 - beta) * previousProbabilities.Clarify,
      Plan: beta * currentProbabilities.Plan + (1 - beta) * previousProbabilities.Plan,
      Execute: beta * currentProbabilities.Execute + (1 - beta) * previousProbabilities.Execute,
      Verify: beta * currentProbabilities.Verify + (1 - beta) * previousProbabilities.Verify,
      Reflect: beta * currentProbabilities.Reflect + (1 - beta) * previousProbabilities.Reflect
    };
  }

  /**
   * Step 5: Calculate message weight
   * Considers time-based, token-based, and event-based factors
   */
  private calculateMessageWeight(
    message: UserMessage,
    previousMessage: UserMessage | null,
    hintsRequested: boolean = false,
    reflectionTrigger: boolean = false
  ): number {
    // Time-based weight: longer dwell time increases influence
    let timeWeight = 1.0;
    if (previousMessage) {
      const timeDiff = message.timestamp.getTime() - previousMessage.timestamp.getTime();
      const minutesDiff = timeDiff / (1000 * 60); // Convert to minutes
      timeWeight = Math.min(2.0, 1.0 + minutesDiff * 0.1); // Cap at 2x
    }

    // Token-based weight: longer messages weigh more
    const tokenWeight = Math.min(2.0, 1.0 + (message.content.length / 500) * 0.5); // Cap at 2x

    // Event-based weight: hint requests or reflection triggers add extra weight
    let eventWeight = 1.0;
    if (hintsRequested) eventWeight += 0.5;
    if (reflectionTrigger) eventWeight += 0.5;

    return timeWeight * tokenWeight * eventWeight;
  }

  /**
   * Main method: Analyze a single user message
   */
  async analyzeMessage(
    message: UserMessage,
    previousAnalysis: MessageAnalysisResult | null = null
  ): Promise<MessageAnalysisResult> {
    // Step 1: Rule-based prior
    const ruleBasedScores = this.calculateRuleBasedScores(message.content);

    // Step 2: Semantic similarity
    const semanticScores = await this.calculateSemanticScores(message.content);

    // Step 3: Fusion
    const fusedProbabilities = this.fuseProbabilities(ruleBasedScores, semanticScores);

    // Step 4: Temporal smoothing
    const smoothedProbabilities = this.applyTemporalSmoothing(
      fusedProbabilities,
      previousAnalysis?.smoothedProbabilities || null
    );

    // Step 5: Calculate weight
    const weight = this.calculateMessageWeight(message, previousAnalysis?.message || null);

    return {
      message,
      ruleBasedScores,
      semanticScores,
      fusedProbabilities,
      smoothedProbabilities,
      weight
    };
  }

  /**
   * Step 5: Stage Percentage Aggregation
   * Computes final percentage distribution across entire chat session
   */
  calculateStagePercentages(analyses: MessageAnalysisResult[]): StageProbabilityVector {
    if (analyses.length === 0) {
      return {
        Clarify: 0,
        Plan: 0,
        Execute: 0,
        Verify: 0,
        Reflect: 0
      };
    }

    const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
    
    // Weighted average: π^(c) = Σ(w_t * p_t^(c)) / Σ(w_t)
    const weightedSums: Partial<StageProbabilityVector> = {};
    let totalWeight = 0;

    analyses.forEach(analysis => {
      const w = analysis.weight;
      totalWeight += w;

      stages.forEach(stage => {
        if (!weightedSums[stage]) {
          weightedSums[stage] = 0;
        }
        weightedSums[stage] = (weightedSums[stage] || 0) + w * analysis.smoothedProbabilities[stage];
      });
    });

    // Normalize to percentages
    return {
      Clarify: totalWeight > 0 ? ((weightedSums.Clarify || 0) / totalWeight) * 100 : 0,
      Plan: totalWeight > 0 ? ((weightedSums.Plan || 0) / totalWeight) * 100 : 0,
      Execute: totalWeight > 0 ? ((weightedSums.Execute || 0) / totalWeight) * 100 : 0,
      Verify: totalWeight > 0 ? ((weightedSums.Verify || 0) / totalWeight) * 100 : 0,
      Reflect: totalWeight > 0 ? ((weightedSums.Reflect || 0) / totalWeight) * 100 : 0
    };
  }

  /**
   * Process all messages in a conversation and return stage percentages
   */
  async processConversation(
    messages: UserMessage[]
  ): Promise<{
    analyses: MessageAnalysisResult[];
    stagePercentages: StageProbabilityVector;
  }> {
    const analyses: MessageAnalysisResult[] = [];
    let previousAnalysis: MessageAnalysisResult | null = null;

    // Process each message sequentially (for temporal smoothing)
    for (const message of messages) {
      const analysis = await this.analyzeMessage(message, previousAnalysis);
      analyses.push(analysis);
      previousAnalysis = analysis;
    }

    // Calculate final stage percentages
    const stagePercentages = this.calculateStagePercentages(analyses);

    return {
      analyses,
      stagePercentages
    };
  }

  /**
   * Get the most likely stage for a message
   */
  getDominantStage(probabilities: StageProbabilityVector): CognitiveStage {
    const stages: CognitiveStage[] = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
    let maxProb = 0;
    let dominantStage: CognitiveStage = 'Clarify';

    stages.forEach(stage => {
      if (probabilities[stage] > maxProb) {
        maxProb = probabilities[stage];
        dominantStage = stage;
      }
    });

    return dominantStage;
  }
}


