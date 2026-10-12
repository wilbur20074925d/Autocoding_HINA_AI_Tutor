import { supabase } from '../lib/supabase';
import { GeminiService } from './geminiService';
import { CourseService } from './courseService';

export interface StudentIntent {
  category: 'debugging' | 'conceptual' | 'planning' | 'syntax' | 'logic' | 'general';
  confidence: number;
  keywords: string[];
  context: any;
}

export interface AIResponse {
  content: string;
  scaffoldingLevel: 'minimal' | 'moderate' | 'high';
  socraticQuestions: string[];
  followUpPrompts: string[];
  templateUsed?: string;
}

export interface ConversationMessage {
  id: string;
  type: 'student' | 'ai';
  content: string;
  intent?: StudentIntent;
  scaffoldingLevel?: string;
  timestamp: Date;
  rating?: string;
}

const isUuid = (value?: string): boolean => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

/** Max conversation turns included in the prompt (sliding window) for longer tutor memory. */
const MAX_CONVERSATION_HISTORY_MESSAGES = 50;

export class AITutoringService {
  // Analyze student intent from their prompt
  static analyzeStudentIntent(prompt: string, taskContext?: any): StudentIntent {
    const lowerPrompt = prompt.toLowerCase();
    const words = prompt.split(' ');
    
    // Intent detection patterns
    const intentPatterns = {
      debugging: {
        keywords: ['error', 'bug', 'wrong', 'broken', 'crash', 'exception', 'traceback', 'debug'],
        phrases: ['not working', 'gives error', 'throws exception', 'crashes when']
      },
      conceptual: {
        keywords: ['understand', 'explain', 'what is', 'how does', 'why does', 'concept', 'theory'],
        phrases: ['help me understand', 'can you explain', 'what does this mean', 'how does this work']
      },
      planning: {
        keywords: ['approach', 'strategy', 'plan', 'steps', 'start', 'begin', 'organize'],
        phrases: ['how to start', 'what approach', 'first step', 'break down', 'plan this']
      },
      syntax: {
        keywords: ['syntax', 'format', 'structure', 'parentheses', 'brackets', 'indentation'],
        phrases: ['syntax error', 'how to write', 'correct format', 'proper syntax']
      },
      logic: {
        keywords: ['logic', 'algorithm', 'flow', 'condition', 'loop', 'if', 'else', 'while', 'for'],
        phrases: ['logic error', 'wrong logic', 'algorithm issue', 'flow problem']
      }
    };

    let bestMatch = { category: 'general' as const, confidence: 0, keywords: [] as string[] };

    // Check each intent category
    Object.entries(intentPatterns).forEach(([category, patterns]) => {
      let score = 0;
      const matchedKeywords: string[] = [];

      // Check keyword matches
      patterns.keywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
          score += 10;
          matchedKeywords.push(keyword);
        }
      });

      // Check phrase matches (higher weight)
      patterns.phrases.forEach(phrase => {
        if (lowerPrompt.includes(phrase)) {
          score += 20;
          matchedKeywords.push(phrase);
        }
      });

      // Boost score based on context
      if (taskContext?.type === 'coding' && ['debugging', 'syntax', 'logic'].includes(category)) {
        score += 5;
      }

      if (score > bestMatch.confidence) {
        bestMatch = {
          category: category as StudentIntent['category'],
          confidence: Math.min(100, score),
          keywords: matchedKeywords
        };
      }
    });

    return {
      ...bestMatch,
      context: taskContext || {}
    };
  }

  // Generate AI response based on intent and scaffolding level
  static async generateAIResponse(
    studentPrompt: string,
    intent: StudentIntent,
    studentLevel: 'beginner' | 'intermediate' | 'advanced',
    taskId?: string,
    previousAttempts: number = 0,
    model: 'gemini' | 'claude' = 'gemini',
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<AIResponse> {
    console.log('AITutoringService.generateAIResponse called');
    console.log('Student prompt:', studentPrompt);
    console.log('Intent:', intent);
    console.log('Student level:', studentLevel);
    console.log('Model:', model);
    
    try {
      // Determine scaffolding level based on student level and attempts
      const scaffoldingLevel = this.determineScaffoldingLevel(studentLevel, previousAttempts, intent.confidence);
      
      // Get task context if available
      const taskContext = taskId ? `Task ID: ${taskId}` : undefined;
      
      if (model === 'claude') {
        console.log('Attempting Claude API call...');
        const { ClaudeService } = await import('./claudeService');
        
        // Build prompt for Claude
        const prompt = this.buildClaudePrompt(studentPrompt, intent, scaffoldingLevel, studentLevel, taskContext);
        const claudeResponse = await ClaudeService.generateContent(prompt, null, {
          max_tokens: 200 // Limit to ~150-200 words (approximately 200 tokens) - keep responses concise
        });
        
        console.log('Claude API success - response length:', claudeResponse.length);
        
        // Use concise response within word limit
        return {
          content: claudeResponse,
          scaffoldingLevel: scaffoldingLevel as AIResponse['scaffoldingLevel'],
          socraticQuestions: [],
          followUpPrompts: [],
          templateUsed: 'claude-generated'
        };
      } else {
      console.log('Attempting Gemini API call...');
      
      // Generate response using Gemini API with conversation history
      const geminiResponse = await GeminiService.generateTutoringResponse(
        studentPrompt,
        intent.category,
        scaffoldingLevel,
        studentLevel,
        taskContext,
        conversationHistory
      );
      
      console.log('Gemini API success - response length:', geminiResponse.content.length);
      
      // No word limit - use complete response
      return {
        content: geminiResponse.content,
        scaffoldingLevel: scaffoldingLevel as AIResponse['scaffoldingLevel'],
        socraticQuestions: geminiResponse.socraticQuestions,
        followUpPrompts: geminiResponse.followUpPrompts,
        templateUsed: 'gemini-generated'
      };
      }
    } catch (error) {
      console.error(`${model} API failed:`, error);
      
      // Fallback to original rule-based system if API fails
      console.log('Using rule-based fallback response');
      const scaffoldingLevel = this.determineScaffoldingLevel(studentLevel, previousAttempts, intent.confidence);
      const template = await this.getPromptTemplate(intent.category, studentLevel);
      const response = this.generateResponseByIntent(studentPrompt, intent, scaffoldingLevel, template);
      
      return response;
    }
  }

  // Helper methods for new prompt system
  private static selectResponseTypeWithVariety(
    intent: string,
    history?: Array<{ role: string; content: string }>,
    studentState?: string
  ): string {
    const intentTypes: Record<string, string[]> = {
      debugging: ['explanation', 'structured', 'examples_driven', 'guided_exploration'],
      conceptual: ['explanation', 'analogical', 'visual_conceptual', 'examples_driven'],
      planning: ['structured', 'guided_exploration', 'explanation', 'collaborative'],
      syntax: ['examples_driven', 'structured', 'explanation'],
      logic: ['explanation', 'visual_conceptual', 'guided_exploration', 'pattern_recognition'],
      general: ['explanation', 'examples_driven', 'analogical']
    };
    
    const availableTypes = intentTypes[intent] || ['explanation', 'examples_driven', 'structured'];
    
    // Rotate to avoid repetition
    const recentTypes: string[] = [];
    if (history && history.length > 0) {
      for (let i = history.length - 1; i >= Math.max(0, history.length - 4); i--) {
        const msg = history[i];
        if (msg.role === 'assistant' || msg.role === 'ai') {
          recentTypes.push((msg as any).responseType || 'explanation');
        }
      }
    }
    
    const unusedTypes = availableTypes.filter(t => !recentTypes.includes(t));
    const typeToUse = unusedTypes.length > 0 ? unusedTypes[0] : availableTypes[0];
    
    if (studentState === 'frustrated') return 'structured';
    if (studentState === 'confident') return 'explanation';
    if (studentState === 'stuck') return 'guided_exploration';
    
    return typeToUse;
  }

  private static getProgressiveLevel(messageCount: number, studentState: string): string {
    if (messageCount <= 2) return 'LEVEL_1_EXPLAIN_SHOW';
    if (messageCount <= 5) return 'LEVEL_2_BREAK_DOWN';
    if (studentState === 'stuck' || studentState === 'frustrated') return 'LEVEL_3_COLLABORATIVE';
    return 'LEVEL_4_CHALLENGE_EXTEND';
  }

  private static getProgressiveInstructions(level: string): string {
    const instructions: Record<string, string> = {
      'LEVEL_1_EXPLAIN_SHOW': '- Provide clear, direct explanations. Use concrete examples. Show patterns visually. Ask ONE question only if it clarifies.',
      'LEVEL_2_BREAK_DOWN': '- Break explanations into smaller chunks. Provide step-by-step guidance. Use analogies. Ask ONE strategic question (optional).',
      'LEVEL_3_COLLABORATIVE': '- Work through examples together. Explain thinking process. Provide clear explanations of each step.',
      'LEVEL_4_CHALLENGE_EXTEND': '- Present concepts clearly. Extend to related concepts. Ask deeper questions only if they extend thinking.'
    };
    return instructions[level] || instructions['LEVEL_1_EXPLAIN_SHOW'];
  }

  private static getIntentBasedStrategy(intent: string, studentState: string): string {
    if (intent === 'debugging') {
      return studentState === 'frustrated' 
        ? 'I notice you might be stuck. Let me explain the error directly and provide clear steps to debug it.'
        : 'When debugging, explain what the error means, how to read it, and provide systematic debugging steps.';
    }
    if (intent === 'conceptual') {
      return 'Explain the concept using analogies and examples. Break it down step-by-step. Show how it works.';
    }
    if (intent === 'planning') {
      return 'Break the problem into phases. Explain a good approach. Show how to think through it systematically.';
    }
    return 'Provide clear explanations of the concept with examples and actionable guidance.';
  }

  private static getAdaptiveResponse(studentState: string): string {
    const responses: Record<string, string> = {
      frustrated: 'The student seems frustrated. Provide direct, supportive explanations. Help them get unstuck with clear steps.',
      stuck: 'The student seems stuck. Provide clear explanations and break things down step-by-step.',
      confident: 'The student seems confident. Validate their approach and extend their understanding with deeper explanations.',
      exploring: 'The student is exploring. Provide clear, engaging explanations with examples.'
    };
    return responses[studentState] || responses.exploring;
  }

  private static getEmotionalTone(studentState: string): string {
    const tones: Record<string, string> = {
      frustrated: 'supportive and direct',
      stuck: 'patient and clear',
      confident: 'encouraging and extending',
      exploring: 'engaging and clear'
    };
    return tones[studentState] || 'encouraging and clear';
  }

  private static buildClaudePrompt(
    studentPrompt: string,
    intent: StudentIntent,
    scaffoldingLevel: string,
    studentLevel: string,
    taskContext?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): string {
    const studentState = this.detectStudentState(studentPrompt, conversationHistory);
    const messageCount = conversationHistory?.length || 0;
    const responseType = this.selectResponseTypeWithVariety(intent.category, conversationHistory, studentState);
    const communicationStyle = this.selectCommunicationStyle(intent.category, studentLevel);
    const progressiveLevel = this.getProgressiveLevel(messageCount, studentState);
    const intentStrategy = this.getIntentBasedStrategy(intent.category, studentState);
    const adaptiveResponse = this.getAdaptiveResponse(studentState);

    return `You are an AI tutor designed to help students learn through EXPLANATION-FIRST teaching. Your primary role is to EXPLAIN and TEACH, not to question.

CRITICAL PRINCIPLES:
1. ABSOLUTE REQUIREMENT - MANDATORY STRUCTURE: Your response MUST include ALL FOUR parts in this EXACT order: (1) EXPLANATION, (2) GUIDANCE, (3) SRL SUPPORT, (4) SOCRATIC QUESTIONS. Missing ANY part makes your response INCOMPLETE and INVALID. This is NON-NEGOTIABLE and STRICTLY ENFORCED.
2. EXPLAIN FIRST: Your primary job is to EXPLAIN and TEACH concepts clearly. Provide detailed, comprehensive knowledge and understanding.
3. NO WORD LIMIT: There is NO word limit. Provide complete, thorough responses that fully address the student's question. Include all four parts with comprehensive explanations.
4. STRUCTURED FORMATTING: Use clear paragraph breaks, bullet points, headings, and organized sections. Separate ideas into distinct paragraphs.
5. NEVER provide complete code solutions - use pseudocode or describe logic flow only.

PEDAGOGICAL FRAMEWORKS:

SCAFFOLDING PRINCIPLES (脚手架原则):
- Current Scaffolding Level: ${scaffoldingLevel}
- Apply progressive scaffolding based on student's Zone of Proximal Development (ZPD)
- For ${scaffoldingLevel === 'high' ? 'HIGH scaffolding' : scaffoldingLevel === 'moderate' ? 'MODERATE scaffolding' : 'MINIMAL scaffolding'}: ${scaffoldingLevel === 'high' ? 'Provide step-by-step guidance, break down complex tasks into smaller parts, offer detailed hints, and gradually reduce support as understanding increases.' : scaffoldingLevel === 'moderate' ? 'Offer structured guidance with some hints, encourage student thinking, and provide support at key decision points.' : 'Provide minimal guidance, encourage independent thinking, and offer hints only when truly needed.'}
- Fade scaffolding gradually: Start with more support, then reduce it as the student demonstrates understanding
- Adjust scaffolding dynamically based on student responses and comprehension

SELF-REGULATED LEARNING (SRL) PRINCIPLES (自我调节学习原则):
- Support metacognition: Help students think about their own thinking processes
- Encourage planning: Guide students to plan their approach before solving
- Promote monitoring: Help students monitor their understanding and progress
- Facilitate reflection: Encourage students to reflect on what they learned and how they learned it
- Build self-efficacy: Support students' confidence in their ability to learn and solve problems
- Encourage goal-setting: Help students set clear, achievable learning goals
- Support self-evaluation: Guide students to evaluate their own work and understanding

SOCRATIC QUESTIONING (苏格拉底提问法):
- ALWAYS include 1-2 Socratic questions (苏格拉底式问题) after your explanation
- Socratic questions help students discover answers through guided thinking (引导性思维)
- Types of Socratic questions to use:
  * Clarification questions: "What do you mean by...?", "Can you explain that further?"
  * Assumption questions: "What assumptions are you making?", "Why do you think that?"
  * Evidence questions: "What evidence supports your idea?", "How do you know that?"
  * Perspective questions: "What would someone else think about this?", "What's another way to look at this?"
  * Implication questions: "What would happen if...?", "What are the consequences of that?"
  * Meta questions: "Why is this question important?", "How does this relate to what we discussed earlier?"
- Questions should extend understanding, not test knowledge
- Make questions collaborative and thought-provoking
- Questions should help students apply what was just explained
- Format Socratic questions in a "## Reflection Questions (反思问题)" section

STUDENT CONTEXT:
- Level: ${studentLevel}
- Intent: ${intent.category}
- Student State: ${studentState}
- Scaffolding Level: ${scaffoldingLevel}
- Conversation Stage: ${progressiveLevel}
- Response Type: ${responseType}
- Communication Style: ${communicationStyle}
${taskContext ? `- Task context: ${taskContext}` : ''}

CONVERSATION HISTORY CONTEXT:
${conversationHistory && conversationHistory.length > 0 ? 
  `IMPORTANT: You are continuing a conversation. Consider ALL previous exchanges to provide coherent, context-aware responses.

Previous conversation:
${conversationHistory.slice(-MAX_CONVERSATION_HISTORY_MESSAGES).map((msg, idx) => {
  const role = msg.role === 'user' || msg.role === 'student' ? 'Student' : 'AI Tutor';
  return `${role}: ${msg.content}`;
}).join('\n\n')}

Current conversation context: The student has asked "${studentPrompt}". Connect your response to what was discussed earlier. Reference previous explanations, build on previous concepts, and ensure continuity with the conversation flow.` :
  'This is the beginning of the conversation.'}

STUDENT QUESTION:
"${studentPrompt}"

${adaptiveResponse}

${intentStrategy}

RESPONSE REQUIREMENTS:

STRUCTURED FORMATTING (CRITICAL):
- Use clear paragraph breaks - separate each idea into its own paragraph
- Use bullet points for lists (NOT in paragraph form)
- Use headings (##) to organize sections
- Use numbered lists for step-by-step instructions
- Break up long explanations into multiple paragraphs
- Each paragraph should focus on ONE main idea

ABSOLUTE MANDATORY RESPONSE STRUCTURE (STRICTLY ENFORCED - MISSING ANY PART MAKES RESPONSE INVALID):
CRITICAL RULE: Your response MUST include ALL FOUR parts in this EXACT order. Missing ANY part will cause your response to be REJECTED as INCOMPLETE. This is ABSOLUTELY MANDATORY and NON-NEGOTIABLE:

1. EXPLANATION (REQUIRED - must be present)
2. GUIDANCE (REQUIRED - must be present)  
3. SRL SUPPORT (REQUIRED - must be present)
4. SOCRATIC QUESTIONS (REQUIRED - must be present in "## Reflection Questions (反思问题)" section)

STRUCTURE CHECKLIST - Before you finish writing, verify your response contains:
✓ EXPLANATION section (explaining the concept clearly)
✓ GUIDANCE section (providing next steps/strategies with scaffolding)
✓ SRL SUPPORT section (encouraging planning/monitoring/reflection)
✓ "## Reflection Questions (反思问题)" section with 1-2 Socratic questions

DO NOT skip any part. DO NOT provide only explanation without guidance, SRL support, and Socratic questions. ALL FOUR parts are REQUIRED for a complete response.

[40%] PART 1: EXPLANATION/INFORMATION (REQUIRED - MUST BE PRESENT - KEEP IT BRIEF):
- Provide clear, direct explanations of concepts and knowledge
- Explain HOW things work, WHY they work that way (in 1-2 sentences maximum)
- Use 1 concrete example if needed (brief)
- Break down complex ideas into understandable parts (concise version)
- Give actionable insights and information (briefly)
- This should be the MAIN part but KEEP IT CONCISE (2-3 sentences max)
- FOCUS ON TEACHING AND EXPLAINING, NOT ASKING
- CRITICAL: This section is REQUIRED but must be BRIEF - do not elaborate extensively

[10%] PART 2: GUIDANCE SECTION (REQUIRED - MUST BE PRESENT - with SCAFFOLDING):
- CRITICAL: You MUST include this section in EVERY response. Missing this section makes your response INCOMPLETE.
- Provide step-by-step direction appropriate for ${scaffoldingLevel} scaffolding level
- Offer actionable next steps with appropriate level of support
- Show the path forward clearly
- Give concrete strategies
- Apply scaffolding principles: ${scaffoldingLevel === 'high' ? 'Offer detailed guidance and hints' : scaffoldingLevel === 'moderate' ? 'Provide structured guidance with some independence' : 'Encourage independent thinking with minimal hints'}

[10%] PART 3: SRL SUPPORT (REQUIRED - MUST BE PRESENT - Self-Regulated Learning):
- CRITICAL: You MUST include this section in EVERY response. Missing this section makes your response INCOMPLETE.
- Encourage planning: "Before you start, think about..."
- Promote monitoring: "As you work, check if..."
- Facilitate reflection: "After completing this, reflect on..."
- Build self-efficacy: Acknowledge progress and effort
- Support metacognition: "Think about your thinking process..."
- Integrate SRL principles to support self-regulated learning

[10%] PART 4: SOCRATIC QUESTIONING (REQUIRED - MUST BE PRESENT - 苏格拉底提问法):
- CRITICAL: You MUST include this section in EVERY response. Missing this section makes your response INCOMPLETE.
- AFTER your explanation, ALWAYS include 1-2 Socratic questions (苏格拉底式问题)
- Format in a section: "## Reflection Questions (反思问题)"
- This section MUST be present at the end of your response
- Use Socratic questioning principles (see PEDAGOGICAL FRAMEWORKS above)
- Questions should extend understanding, not test knowledge
- Make questions collaborative and thought-provoking
- Questions should help students apply what was just explained
- Examples: "What do you think would happen if...?", "How does this connect to...?", "Why might this approach be better than...?", "What assumptions are you making about...?"

RESPONSE STYLE:
- Use ${communicationStyle} style
- Follow ${responseType} approach
- Be ${studentState === 'frustrated' ? 'supportive and direct' : studentState === 'curious' ? 'exploratory and deep' : 'encouraging and clear'}
- NEVER just ask questions - always provide valuable content first

FORMATTING INSTRUCTIONS (CRITICAL):
- Use Markdown formatting: **bold**, \`code\`, code blocks, lists, headings
- Use code blocks with language tags for code examples
- Use LaTeX for formulas: \`\$formula\$\` or block formulas
- Structure with headings, bullet points, numbered lists
- Use blockquotes > for important notes

EXAMPLE RESPONSE STRUCTURE:
"Great question! Let me explain how [concept] works. [Clear 2-3 sentence explanation with example]. 
The key insight is [insight]. 
Here's a simple way to think about it: [analogy].
For your specific situation, try [actionable step].
[OPTIONAL: One thought-provoking question that extends understanding]."

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

CRITICAL REMINDERS - STRICTLY ENFORCE THIS STRUCTURE:
- ABSOLUTE REQUIREMENT: You MUST include ALL FOUR parts in EVERY response: (1) EXPLANATION, (2) GUIDANCE, (3) SRL SUPPORT, (4) SOCRATIC QUESTIONS. Missing ANY part makes your response INCOMPLETE and INVALID. This is NON-NEGOTIABLE.
- STRICT WORD LIMIT: Maximum 150-200 words total. Be concise and brief. Keep each section short. Do not exceed this limit.
- TOKEN MANAGEMENT: Keep explanations brief (2-3 sentences), guidance brief (1-2 sentences), SRL support brief (1 sentence), and Socratic questions brief (1 question). Prioritize brevity over extensive detail.
- STRUCTURE CHECKLIST: Before finishing, verify: ✓ EXPLANATION (2-3 sentences) ✓ GUIDANCE (1-2 sentences) ✓ SRL SUPPORT (1 sentence) ✓ "## Reflection Questions (反思问题)" section (1 question)
- Your primary goal: TEACH and EXPLAIN concepts clearly but CONCISELY while including ALL FOUR required parts within the word limit
- Use STRUCTURED paragraphs - NOT one long paragraph
- Use bullet points and lists for structured information (sparingly to save tokens)
- ALWAYS include Socratic questions after your explanation (in a "## Reflection Questions (反思问题)" section) but keep it brief
- Apply scaffolding principles appropriate for ${scaffoldingLevel} level (briefly)
- Integrate SRL principles to support self-regulated learning (briefly)
- Connect your response to conversation history briefly if this is not the first message
- Reference previous explanations briefly and build on earlier concepts
- Prioritize BREVITY - include all four parts but keep each part brief to stay within 150-200 word limit

FINAL CHECK: Before you respond, ask yourself: "Does my response include ALL FOUR parts: (1) EXPLANATION, (2) GUIDANCE, (3) SRL SUPPORT, (4) SOCRATIC QUESTIONS in '## Reflection Questions (反思问题)' section?" If the answer is NO, revise your response to include ALL parts.

Remember: STRICTLY FOLLOW the MANDATORY STRUCTURE: (1) EXPLANATION, (2) GUIDANCE, (3) SRL SUPPORT, (4) SOCRATIC QUESTIONS. Write in clear, separated paragraphs. Use bullet points for lists. Structure your response with headings and sections. ALWAYS include ALL FOUR required parts in every response - DO NOT skip any part. Missing any part makes your response INCOMPLETE. Apply scaffolding and SRL principles. Connect to conversation context. Your job is to provide COMPLETE responses with ALL FOUR parts in every message.`;
  }

  private static detectStudentState(
    currentPrompt: string,
    history?: Array<{ role: string; content: string }>
  ): 'exploring' | 'stuck' | 'confident' | 'frustrated' {
    if (!history || history.length === 0) return 'exploring';
    
    const lowerPrompt = currentPrompt.toLowerCase();
    const recentMessages = history.slice(-4).map(m => m.content.toLowerCase()).join(' ');
    
    // Detect frustration signals
    if (lowerPrompt.includes('stuck') || lowerPrompt.includes('frustrated') || 
        lowerPrompt.includes('not working') || lowerPrompt.includes('still') ||
        (recentMessages.includes('error') && history.length > 3)) {
      return 'frustrated';
    }
    
    // Detect confidence signals
    if (lowerPrompt.includes('i think') || lowerPrompt.includes('i believe') ||
        lowerPrompt.includes('maybe') || lowerPrompt.includes('should')) {
      return 'confident';
    }
    
    // Detect stuck signals
    if (lowerPrompt.includes('help') || lowerPrompt.includes('how') ||
        lowerPrompt.includes('what') || lowerPrompt.includes('why')) {
      return 'stuck';
    }
    
    return 'exploring';
  }

  private static selectResponseType(
    intent: string,
    history?: Array<{ role: string; content: string }>,
    studentState?: string
  ): string {
    // Determine last response type from history if available
    const lastType = history && history.length > 0 ? 
      (history[history.length - 1] as any)?.responseType : null;
    
    // Map intent to preferred response types
    const intentTypes: Record<string, string[]> = {
      debugging: ['explanation', 'structured', 'example_driven'],
      conceptual: ['explanation', 'analogical', 'visual_conceptual'],
      planning: ['structured', 'guided_exploration', 'explanation'],
      syntax: ['example_driven', 'structured', 'explanation'],
      logic: ['explanation', 'visual_conceptual', 'guided_exploration'],
      general: ['explanation', 'example_driven', 'analogical']
    };
    
    const availableTypes = intentTypes[intent] || ['explanation', 'example_driven', 'structured'];
    
    // Rotate types to avoid repetition
    if (lastType && availableTypes.includes(lastType)) {
      const currentIndex = availableTypes.indexOf(lastType);
      return availableTypes[(currentIndex + 1) % availableTypes.length];
    }
    
    // Adjust based on student state
    if (studentState === 'frustrated') return 'structured';
    if (studentState === 'confident') return 'explanation';
    
    return availableTypes[0];
  }

  private static selectCommunicationStyle(
    intent: string,
    studentLevel: string
  ): string {
    const styles = ['conversational', 'expert_mentor', 'coach', 'narrative'];
    
    // Beginner students benefit from conversational
    if (studentLevel === 'beginner') {
      return 'conversational';
    }
    
    // Intermediate benefit from expert mentor
    if (studentLevel === 'intermediate') {
      return 'expert_mentor';
    }
    
    // Advanced benefit from coach style
    return 'coach';
  }

  private static determineScaffoldingLevel(
    studentLevel: string,
    attempts: number,
    intentConfidence: number
  ): 'minimal' | 'moderate' | 'high' {
    // More scaffolding for beginners and after multiple attempts
    if (studentLevel === 'beginner' || attempts > 2) return 'high';
    if (studentLevel === 'intermediate' || attempts > 1 || intentConfidence < 70) return 'moderate';
    return 'minimal';
  }

  private static async getPromptTemplate(
    intent: string,
    difficulty: string
  ): Promise<any> {
    try {
      if (!supabase) {
        return this.getDefaultTemplate(intent, difficulty);
      }

      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('intent_category', intent)
        .eq('difficulty_level', difficulty)
        .eq('is_active', true)
        .order('usage_count', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching prompt template:', error);
        return this.getDefaultTemplate(intent, difficulty);
      }

      if (!data) {
        return this.getDefaultTemplate(intent, difficulty);
      }

      // Update usage count
      await supabase
        .from('prompt_templates')
        .update({ usage_count: data.usage_count + 1 })
        .eq('id', data.id);

      return data;
    } catch (error) {
      console.error('Exception in getPromptTemplate:', error);
      return this.getDefaultTemplate(intent, difficulty);
    }
  }

  private static getDefaultTemplate(intent: string, difficulty: string) {
    const templates = {
      debugging: {
        beginner: {
          template_content: "I see you're encountering an issue. Let's work through this systematically.",
          socratic_questions: [
            "What were you trying to accomplish when this error occurred?",
            "Can you describe exactly what happens when you run your code?",
            "What do you think the error message is telling you?"
          ],
          scaffolding_cues: [
            "Let's read the error message carefully together",
            "Try running just the problematic line by itself",
            "Check your syntax character by character"
          ]
        },
        intermediate: {
          template_content: "Let's debug this step by step. What debugging strategies have you tried?",
          socratic_questions: [
            "What debugging steps have you already attempted?",
            "Where do you think the error might be originating?",
            "What would you expect to happen vs. what's actually happening?"
          ],
          scaffolding_cues: [
            "Use print statements to trace variable values",
            "Check your logic flow with different inputs",
            "Consider edge cases that might cause issues"
          ]
        },
        advanced: {
          template_content: "What's your hypothesis about the root cause of this issue?",
          socratic_questions: [
            "What's your current hypothesis about the bug?",
            "How would you systematically test this hypothesis?",
            "What debugging tools or techniques would be most effective here?"
          ],
          scaffolding_cues: [
            "Consider using a debugger to step through execution",
            "Analyze the call stack and variable states",
            "Think about performance implications and optimization"
          ]
        }
      },
      conceptual: {
        beginner: {
          template_content: "Let's explore this concept together. What do you already know about this topic?",
          socratic_questions: [
            "What do you already know about this concept?",
            "Can you think of a real-world analogy for this?",
            "How do you think this concept connects to what we've learned before?"
          ],
          scaffolding_cues: [
            "Start with the basic definition",
            "Look for simple examples first",
            "Connect to familiar concepts"
          ]
        },
        intermediate: {
          template_content: "Great question! How would you explain this concept to someone else?",
          socratic_questions: [
            "How would you explain this to a beginner?",
            "What are the key components of this concept?",
            "When would you use this in practice?"
          ],
          scaffolding_cues: [
            "Break down the concept into components",
            "Consider practical applications",
            "Compare with similar concepts"
          ]
        },
        advanced: {
          template_content: "Let's dive deeper. What are the implications and trade-offs of this concept?",
          socratic_questions: [
            "What are the trade-offs of using this approach?",
            "How does this concept scale in complex scenarios?",
            "What alternative approaches exist and when would you use them?"
          ],
          scaffolding_cues: [
            "Analyze complexity and performance implications",
            "Consider design patterns and best practices",
            "Explore advanced use cases and optimizations"
          ]
        }
      },
      planning: {
        beginner: {
          template_content: "Let's break this problem down into manageable steps.",
          socratic_questions: [
            "What is the problem asking you to do?",
            "What information do you have to work with?",
            "What would be a good first step?"
          ],
          scaffolding_cues: [
            "Read the problem statement carefully",
            "Identify inputs and expected outputs",
            "Start with the simplest case"
          ]
        },
        intermediate: {
          template_content: "What's your strategy for approaching this problem?",
          socratic_questions: [
            "What problem-solving strategies could apply here?",
            "How can you break this into smaller subproblems?",
            "What similar problems have you solved before?"
          ],
          scaffolding_cues: [
            "Use divide-and-conquer approach",
            "Consider multiple solution strategies",
            "Plan your data structures and algorithms"
          ]
        },
        advanced: {
          template_content: "How would you design an efficient solution for this problem?",
          socratic_questions: [
            "What are the efficiency requirements for this solution?",
            "How would you optimize for time vs. space complexity?",
            "What design patterns might be applicable?"
          ],
          scaffolding_cues: [
            "Analyze algorithmic complexity",
            "Consider scalability and maintainability",
            "Design for extensibility and reuse"
          ]
        }
      }
    };

    return templates[intent]?.[difficulty] || templates.general?.beginner || {
      template_content: "I'm here to help guide your learning. What specific aspect would you like to explore?",
      socratic_questions: ["What have you tried so far?", "What do you think might work?"],
      scaffolding_cues: ["Break the problem into smaller parts", "Consider what you already know"]
    };
  }

  private static generateResponseByIntent(
    prompt: string,
    intent: StudentIntent,
    scaffoldingLevel: string,
    template: any
  ): AIResponse {
    // Start with content first (70%)
    let content = template.template_content;
    let socraticQuestions = template.socratic_questions || [];
    let followUpPrompts = template.follow_up_prompts || [];

    // Adjust content based on scaffolding level - ADD EXPLANATIONS FIRST
    switch (scaffoldingLevel) {
      case 'high':
        // Provide detailed explanations first
        content += "\n\nLet me explain this clearly to help you understand:";
        // Add detailed explanation based on intent
        if (intent.category === 'debugging') {
          content += "\n\n**Understanding the Error:**\nWhen you encounter errors, they're actually helpful signals. The error message tells you exactly what went wrong and where. Let's break down how to read and interpret error messages systematically.\n\n**Systematic Debugging Process:**";
        } else if (intent.category === 'conceptual') {
          content += "\n\n**Understanding the Concept:**\nLet me explain this concept clearly with examples so you can see how it works in practice.\n\n**Key Points:**";
        } else if (intent.category === 'planning') {
          content += "\n\n**Problem-Solving Approach:**\nA good approach involves breaking down complex problems into manageable pieces. Let me walk you through a systematic way to tackle this.\n\n**Step-by-Step Methodology:**";
        }
        socraticQuestions = socraticQuestions.slice(0, 1); // Only ONE question
        break;
      case 'moderate':
        content += "\n\nLet me explain this concept and guide you through it:";
        // Add moderate explanation
        if (intent.category === 'debugging') {
          content += "\n\n**Error Analysis:**\nErrors occur when something unexpected happens. The key is understanding what the error message is telling you.\n\n**Debugging Strategy:**";
        }
        socraticQuestions = socraticQuestions.slice(0, 1); // Only ONE question
        break;
      case 'minimal':
        content += "\n\nHere's a helpful explanation to get you started:";
        socraticQuestions = socraticQuestions.slice(0, 1); // Only ONE question
        break;
    }

    // Add scaffolding cues (20% guidance section)
    if (template.scaffolding_cues) {
      content += "\n\n💡 **Helpful Approaches:**\n";
      const numCues = scaffoldingLevel === 'high' ? 3 : 2;
      template.scaffolding_cues.slice(0, numCues).forEach((cue: string, index: number) => {
        content += `${index + 1}. ${cue}\n`;
      });
    }

    // Add ONE strategic question only (10%)
    if (socraticQuestions.length > 0) {
      // Select the best question - one that extends thinking, not tests knowledge
      const strategicQuestion = socraticQuestions[0];
      content += `\n\n🤔 **To deepen your understanding:** ${strategicQuestion}`;
      // Keep only this one question for the return value
      socraticQuestions = [strategicQuestion];
    }

    // Remove the reflection prompt that just asks questions - replace with encouragement
    content += "\n\nYou've got this! Try applying what we discussed, and let me know how it goes or if you'd like to explore any part further.";

    return {
      content,
      scaffoldingLevel: scaffoldingLevel as AIResponse['scaffoldingLevel'],
      socraticQuestions,
      followUpPrompts,
      templateUsed: template.id
    };
  }

  // Save conversation to database
  static async saveConversation(
    studentId: string,
    taskId: string,
    sessionId: string,
    messageType: 'student' | 'ai',
    content: string,
    intent?: StudentIntent,
    scaffoldingLevel?: string,
    templateUsed?: string
  ) {
    try {
      if (!isUuid(sessionId)) {
        console.warn('AITutoringService.saveConversation: skipping Supabase insert because sessionId is not a UUID', sessionId);
        return null;
      }

      // Prepare the insert data object
      const insertData: any = {
        student_id: studentId,
        session_id: sessionId,
        message_type: messageType,
        content,
        intent_category: intent?.category,
        confidence_score: intent?.confidence,
        scaffolding_level: scaffoldingLevel
      };

      // Only include task_id if it's a valid non-empty string
      if (isUuid(taskId)) {
        insertData.task_id = taskId;
      }

      // Only include prompt_template_used if it's a valid UUID
      if (templateUsed && templateUsed !== 'gemini-generated' && templateUsed !== 'rule-based') {
        insertData.prompt_template_used = templateUsed;
      }

      const { data, error } = await supabase
        .from('ai_conversations')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error saving conversation:', error);
        return null;
      }

      // Save intent log if it's a student message
      if (messageType === 'student' && intent) {
        await this.saveIntentLog(studentId, data.id, content, intent);
      }

      return data;
    } catch (error) {
      console.error('Error in saveConversation:', error);
      return null;
    }
  }

  // Save intent recognition log
  static async saveIntentLog(
    studentId: string,
    conversationId: string,
    originalPrompt: string,
    intent: StudentIntent
  ) {
    try {
      await supabase
        .from('student_intent_logs')
        .insert({
          student_id: studentId,
          conversation_id: conversationId,
          original_prompt: originalPrompt,
          detected_intent: intent.category,
          confidence_score: intent.confidence,
          keywords_matched: intent.keywords,
          context_factors: intent.context
        });
    } catch (error) {
      console.error('Error saving intent log:', error);
    }
  }

  // Save student rating of AI response
  static async saveResponseRating(
    studentId: string,
    conversationId: string,
    rating: 'very_helpful' | 'helpful' | 'neutral' | 'unhelpful' | 'very_unhelpful',
    feedback?: string,
    suggestions?: string
  ) {
    try {
      const { error } = await supabase
        .from('ai_response_ratings')
        .insert({
          student_id: studentId,
          conversation_id: conversationId,
          rating,
          feedback_text: feedback,
          improvement_suggestions: suggestions
        });

      if (error) {
        console.error('Error saving response rating:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in saveResponseRating:', error);
      return false;
    }
  }

  // Get conversation history for a session
  static async getConversationHistory(sessionId: string): Promise<ConversationMessage[]> {
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching conversation history:', error);
        return [];
      }

      return data.map(conv => ({
        id: conv.id,
        type: conv.message_type as 'student' | 'ai',
        content: conv.content,
        intent: conv.intent_category ? {
          category: conv.intent_category,
          confidence: conv.confidence_score || 0,
          keywords: [],
          context: {}
        } : undefined,
        scaffoldingLevel: conv.scaffolding_level,
        timestamp: new Date(conv.created_at)
      }));
    } catch (error) {
      console.error('Error in getConversationHistory:', error);
      return [];
    }
  }

  // Get scaffolding hints for a task
  static async getScaffoldingHints(taskId: string, currentAttempts: number = 0) {
    try {
      const { data, error } = await supabase
        .from('scaffolding_hints')
        .select('*')
        .eq('task_id', taskId)
        .eq('is_active', true)
        .lte('prerequisite_attempts', currentAttempts)
        .order('hint_level', { ascending: true });

      if (error) {
        console.error('Error fetching scaffolding hints:', error);
        return [];
      }

      return data;
    } catch (error) {
      console.error('Error in getScaffoldingHints:', error);
      return [];
    }
  }

  // Update learning analytics
  static async updateLearningAnalytics(
    studentId: string,
    taskId: string,
    intent: StudentIntent,
    rating?: string
  ) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get existing analytics for today
      const { data: existing } = await supabase
        .from('learning_analytics')
        .select('*')
        .eq('student_id', studentId)
        .eq('task_id', taskId)
        .eq('session_date', today)
        .single();

      const intentDistribution = existing?.intent_distribution || {};
      intentDistribution[intent.category] = (intentDistribution[intent.category] || 0) + 1;

      const updateData = {
        student_id: studentId,
        task_id: taskId,
        session_date: today,
        total_interactions: (existing?.total_interactions || 0) + 1,
        intent_distribution: intentDistribution,
        average_rating: rating ? this.calculateAverageRating(existing?.average_rating, rating) : existing?.average_rating
      };

      await supabase
        .from('learning_analytics')
        .upsert(updateData, {
          onConflict: 'student_id,task_id,session_date'
        });
    } catch (error) {
      console.error('Error updating learning analytics:', error);
    }
  }

  private static calculateAverageRating(currentAvg: number | null, newRating: string): number {
    const ratingValues = {
      'very_helpful': 5,
      'helpful': 4,
      'neutral': 3,
      'unhelpful': 2,
      'very_unhelpful': 1
    };

    const newValue = ratingValues[newRating as keyof typeof ratingValues] || 3;
    
    if (!currentAvg) return newValue;
    
    // Simple moving average (in real implementation, you'd track count)
    return (currentAvg + newValue) / 2;
  }

  // Get learning analytics for visualization
  static async getLearningAnalytics(studentId: string, timeRange: 'week' | 'month' | 'semester' = 'month') {
    try {
      const daysBack = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data, error } = await supabase
        .from('learning_analytics')
        .select('*')
        .eq('student_id', studentId)
        .gte('session_date', startDate.toISOString().split('T')[0])
        .order('session_date', { ascending: true });

      if (error) {
        console.error('Error fetching learning analytics:', error);
        return [];
      }

      return data;
    } catch (error) {
      console.error('Error in getLearningAnalytics:', error);
      return [];
    }
  }

  // Get class-wide analytics for teachers
  static async getClassAnalytics(teacherId: string) {
    try {
      const courseIds = await CourseService.getTaughtCourseIds(teacherId);
      if (!courseIds.length) return [];

      const { data, error } = await supabase
        .from('learning_analytics')
        .select(`
          *,
          tasks!inner(
            course_id
          )
        `)
        .in('tasks.course_id', courseIds);

      if (error) {
        console.error('Error fetching class analytics:', error);
        return [];
      }

      return data;
    } catch (error) {
      console.error('Error in getClassAnalytics:', error);
      return [];
    }
  }

  // Create or update prompt template
  static async createPromptTemplate(
    teacherId: string,
    templateData: {
      name: string;
      intent_category: string;
      difficulty_level: string;
      template_content: string;
      socratic_questions: string[];
      scaffolding_cues: string[];
      follow_up_prompts: string[];
    }
  ) {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          teacher_id: teacherId,
          ...templateData
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating prompt template:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in createPromptTemplate:', error);
      return null;
    }
  }

  // Create scaffolding hint for a task
  static async createScaffoldingHint(
    teacherId: string,
    taskId: string,
    hintData: {
      hint_level: number;
      hint_content: string;
      trigger_conditions: any;
      prerequisite_attempts: number;
    }
  ) {
    try {
      const { data, error } = await supabase
        .from('scaffolding_hints')
        .insert({
          teacher_id: teacherId,
          task_id: taskId,
          ...hintData
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating scaffolding hint:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in createScaffoldingHint:', error);
      return null;
    }
  }
}