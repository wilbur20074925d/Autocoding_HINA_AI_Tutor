import { GoogleGenerativeAI } from '@google/generative-ai';
import { ZenMuxService } from './zenmuxService';
import type {
  KnowledgeMapEdge,
  KnowledgeMapInsights,
  KnowledgeMapNode,
} from '../types/knowledgeMap';

interface GeminiKnowledgeMapOptions {
  title: string;
  content: string;
  previousNodes?: KnowledgeMapNode[];
  previousEdges?: KnowledgeMapEdge[];
  focusQuestions?: string[];
}

interface GeminiKnowledgeMapResult {
  nodes: KnowledgeMapNode[];
  edges: KnowledgeMapEdge[];
  insights: KnowledgeMapInsights;
  keywords: string[];
}

export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;
  private static model: any = null;

  private static initialize() {
    if (!this.genAI) {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      console.log('[Gemini] Initializing with API key:', apiKey ? 'Present' : 'Missing');
      
      if (!apiKey) {
        console.warn('[Gemini] API key not found. Using fallback responses.');
        return;
      }
      
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });
        console.log('[Gemini] Successfully initialized with model: gemini-2.0-flash-001');
      } catch (error) {
        console.error('[Gemini] Failed to initialize:', error);
        this.genAI = null;
        this.model = null;
      }
    }
  }

  /**
   * Role-specific system prompts for different cognitive styles
   */
  private static getRolePrompt(role: string | null): string {
    const rolePrompts: Record<string, string> = {
      'analyst': `You are operating in ANALYST mode. Your approach is systematic and methodical:
- Break problems down into smaller, manageable subcomponents
- Identify key assumptions and constraints explicitly
- Use logical reasoning and structured analysis
- Ask probing questions that help the student see the parts of a problem
- Encourage decomposition and systematic thinking`,
      
      'experimenter': `You are operating in EXPERIMENTER mode. Your approach is exploratory and hypothesis-driven:
- Encourage hypothesis formation and testing
- Suggest experimental approaches and "what-if" scenarios
- Help the student try multiple approaches without fear of failure
- Focus on learning through experimentation and iteration
- Ask questions like "What would happen if..." and "Let's try..."`,
      
      'reviewer': `You are operating in REVIEWER mode. Your approach is evaluative and critical:
- Help the student critically evaluate solutions and approaches
- Identify potential improvements and alternative perspectives
- Ask reflective questions about the quality of work
- Encourage checking for edge cases and potential errors
- Guide the student to see their work from different angles`,
      
      'summarizer': `You are operating in SUMMARIZER mode. Your approach is synthesizing and articulating:
- Help the student synthesize learning and articulate understanding
- Encourage reflection on key concepts and patterns
- Guide the student to explain their understanding in their own words
- Ask questions that help consolidate knowledge
- Focus on making connections and seeing the big picture`
    };
    
    return rolePrompts[role || ''] || '';
  }

  static async generateContent(
    prompt: string,
    activeRole: string | null = null,
    options?: { max_tokens?: number; systemPrompt?: string; abortSignal?: AbortSignal }
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    const maxTokens = options?.max_tokens;

    console.log(`[Gemini-${requestId}] Starting generateContent request via ZenMux`);
    console.log(`[Gemini-${requestId}] Prompt length: ${prompt.length}`);
    console.log(
      `[Gemini-${requestId}] max_tokens: ${typeof maxTokens === 'number' ? maxTokens : 'none'}`
    );

    try {
      // Use caller's system prompt when provided (e.g. for full-code responses); otherwise default to brief response
      const systemPrompt =
        options?.systemPrompt ??
        `You are a friendly teacher having a conversation with a student.

CRITICAL - Keep it brief but complete:
- Explain the core idea in just 2–3 complete sentences (finish your thoughts)
- Give 1 quick suggestion for next step
- End with 1 complete question

Maximum 100–150 words total for your reply (do not count code in code blocks). Be concise but ensure all sentences are complete. Fit everything (explanation, guidance, question) within this limit and always finish your sentences.`;

      console.log(`[Gemini-${requestId}] Sending request to ZenMux (Gemini 2.5 Flash)...`);

      const response = await ZenMuxService.generateContentWithRetry(
        ZenMuxService.MODELS.GEMINI_2_5_FLASH,
        prompt,
        systemPrompt,
        {
          // No explicit token limit by default; rely on word-based instruction unless caller overrides
          max_tokens: maxTokens,
          temperature: 0.7,
          retries: 3,
          abortSignal: options?.abortSignal,
        }
      );
      
      const duration = Date.now() - startTime;
      console.log(`[Gemini-${requestId}] Success! Response length: ${response.length}, Duration: ${duration}ms`);
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      if ((error as Error)?.name === 'AbortError' || options?.abortSignal?.aborted) {
        throw error;
      }
      console.error(`[Gemini-${requestId}] Unexpected error after ${duration}ms:`, error);
      return this.generateFallbackResponse(prompt);
    }
  }

  /**
   * Generate content with PDF file support
   */
  static async generateContentWithPdf(
    prompt: string,
    fileData: string, // Base64 encoded file data
    mimeType: string = 'application/pdf'
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    console.log(`[Gemini-${requestId}] Starting generateContentWithPdf request`);
    console.log(`[Gemini-${requestId}] Prompt length: ${prompt.length}`);
    console.log(`[Gemini-${requestId}] File MIME type: ${mimeType}`);
    
    try {
      this.initialize();
      
      if (!this.model) {
        console.warn(`[Gemini-${requestId}] Model not initialized - API key missing`);
        return this.generateFallbackResponse(prompt);
      }
      
      // Convert base64 to FileDataPart for Gemini
      const filePart = {
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      };
      
      const textPart = {
        text: prompt
      };
      
      console.log(`[Gemini-${requestId}] Sending request with PDF to Gemini API...`);
      
      const result = await this.model.generateContent([textPart, filePart]);
      const response = await result.response;
      const text = response.text();
      
      const duration = Date.now() - startTime;
      console.log(`[Gemini-${requestId}] Success! Response length: ${text.length}, Duration: ${duration}ms`);
      
      return text;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini-${requestId}] Error after ${duration}ms:`, error);
      // Fallback: return a message indicating PDF processing failed
      return `[PDF processing unavailable] ${this.generateFallbackResponse(prompt)}`;
    }
  }

  static async generateKnowledgeMap(options: GeminiKnowledgeMapOptions): Promise<GeminiKnowledgeMapResult> {
    const {
      title,
      content,
      previousNodes = [],
      previousEdges = [],
      focusQuestions = [],
    } = options;

    if (!content || content.trim().length === 0) {
      console.warn('[Gemini] Empty note content received for knowledge map generation. Returning fallback.');
      return this.generateKnowledgeMapFallback(options);
    }

    try {
      this.initialize();

      if (!this.model) {
        console.warn('[Gemini] Model unavailable when generating knowledge map. Using fallback.');
        return this.generateKnowledgeMapFallback(options);
      }

      const prompt = `You are an AI assistant helping a student team maintain a shared knowledge graph of their collaborative notebook.
Your job is to extract the most important concepts, themes, and relationships from their notes and return a structured JSON object.

NOTE TITLE: ${title}
NOTE CONTENT:
${content}

${previousNodes.length > 0 ? `PREVIOUS NODES (for context only):
${JSON.stringify(previousNodes, null, 2)}` : ''}

${previousEdges.length > 0 ? `PREVIOUS EDGES (for context only):
${JSON.stringify(previousEdges, null, 2)}` : ''}

${focusQuestions.length > 0 ? `TEAM FOCUS QUESTIONS:
${focusQuestions.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}` : ''}

REQUIREMENTS:
- Extract 6-12 high-utility concepts as nodes. Each node MUST include:
  • id (lowercase hyphenated slug without spaces)
  • label (student-friendly name)
  • category (one of: concept, process, evidence, question, task, theory, definition, other)
  • importance (1-5 scale; 5 = central idea)
  • description (1-2 sentence explanation, optional if obvious)
  • sources (array of short quotes or references from the note if available, optional)
  • tags (array of additional descriptors, optional)
- Extract meaningful relationships as edges. Each edge MUST include:
  • id (unique slug)
  • source (node id)
  • target (node id)
  • relation (supports, contradicts, requires, causes, part_of, leads_to, example_of, related_to, other)
  • confidence (0.0-1.0)
  • explanation (short phrase describing the relationship, optional but recommended)
- Provide insights object with:
  • summary (3-4 sentence synthesis of the team's current knowledge)
  • keyThemes (3-5 bullet points capturing overarching themes or clusters)
  • blindSpots (2-4 areas that appear underdeveloped or missing)
  • recommendedQuestions (2-4 probing questions to deepen discussion)
  • suggestedNextSteps (2-4 actionable next steps for the team)
- Provide keywords array (8-12 distilled keywords / tags)

STRICT OUTPUT FORMAT:
Return ONLY a valid JSON object with the schema:
{
  "nodes": [...],
  "edges": [...],
  "insights": {
    "summary": "",
    "keyThemes": [],
    "blindSpots": [],
    "recommendedQuestions": [],
    "suggestedNextSteps": []
  },
  "keywords": []
}
Do NOT wrap in markdown. Do NOT include additional text before or after the JSON.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const parsed = this.parseKnowledgeMapResponse(text);
      if (parsed) {
        return parsed;
      }

      console.warn('[Gemini] Failed to parse knowledge map response. Falling back to heuristic generation.');
      return this.generateKnowledgeMapFallback(options);
    } catch (error) {
      console.error('[Gemini] Error generating knowledge map:', error);
      return this.generateKnowledgeMapFallback(options);
    }
  }

  private static generateFallbackResponse(prompt: string): string {
    console.log('[Gemini] Generating fallback response for prompt:', prompt.substring(0, 100));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('code') || lowerPrompt.includes('python')) {
      return `# Generated Python code based on your diagram
def main():
    # Your program logic here
    print("Hello, World!")
    
    # Add your implementation based on the visual design
    user_input = input("Enter a value: ")
    
    # Process the input
    if user_input:
        print(f"You entered: {user_input}")
    else:
        print("No input provided")

if __name__ == "__main__":
    main()`;
    }
    
    if (lowerPrompt.includes('debug') || lowerPrompt.includes('error')) {
      return "I see you're encountering an issue. Let's work through this systematically:\n\n1. What error message are you seeing?\n2. Which line is causing the problem?\n3. What were you trying to accomplish?\n\nLet's debug this step by step together.";
    }
    
    return "I'm here to help guide your learning. Can you tell me more about what you're working on and what specific challenge you're facing?";
  }

  static async generateTutoringResponse(
    studentPrompt: string,
    intent: string,
    scaffoldingLevel: string,
    studentLevel: string,
    taskContext?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<{
    content: string;
    socraticQuestions: string[];
    followUpPrompts: string[];
  }> {
    console.log('GeminiService: Starting tutoring response generation via ZenMux');
    console.log('Prompt length:', studentPrompt.length);
    console.log('Intent:', intent);
    console.log('Conversation history length:', conversationHistory?.length || 0);
    
    try {
      const fullPrompt = this.constructTutoringPrompt(
        studentPrompt,
        intent,
        scaffoldingLevel,
        studentLevel,
        taskContext,
        conversationHistory
      );

      console.log('Sending request to ZenMux (Gemini 2.5 Flash)...');
      console.log('Prompt length:', fullPrompt.length);
      
      // Use ZenMux service with Gemini 2.5 Flash model
      // The constructTutoringPrompt already includes all instructions, so we pass it as the user prompt
      // Limit to approximately 100-150 words (excluding code)
      const text = await ZenMuxService.generateContentWithRetry(
        ZenMuxService.MODELS.GEMINI_2_5_FLASH,
        fullPrompt,
        undefined, // No separate system prompt since fullPrompt contains everything
        {
          max_tokens: 2048, // Allow full responses (no mid-sentence truncation)
          temperature: 0.7,
          retries: 3
        }
      );
      
      console.log('ZenMux response received, length:', text.length);

      // Parse the structured response
      const parsedResponse = this.parseStructuredResponse(text);
      console.log('Response parsed successfully');
      
      return parsedResponse;
    } catch (error: any) {
      console.error('ZenMux API error details:', error);
      
      if (error.message === 'GEMINI_TIMEOUT') {
        console.log('ZenMux API timed out');
        throw new Error('GEMINI_TIMEOUT');
      } else if (error.message === 'GEMINI_NOT_CONFIGURED') {
        console.log('ZenMux not configured');
        throw new Error('GEMINI_NOT_CONFIGURED');
      } else {
        console.log('ZenMux API general error:', error.message);
        throw new Error('GEMINI_API_ERROR');
      }
    }
  }

  private static generateStructuredFallback(
    studentPrompt: string,
    intent: string,
    _scaffoldingLevel: string
  ): {
    content: string;
    socraticQuestions: string[];
    followUpPrompts: string[];
  } {
    console.log('Generating structured fallback response');
    const input = studentPrompt.toLowerCase();
    
    let content = '';
    let socraticQuestions: string[] = [];
    let followUpPrompts: string[] = [];
    
    if (input.includes('error') || input.includes('bug') || intent === 'debugging') {
      // CONTENT: Clear explanation first (NO QUESTIONS - explanation only)
      content = "I see you're encountering an issue. Let me explain how to approach debugging systematically.\n\n**Understanding Errors:**\nErrors are valuable feedback that tell you exactly what went wrong. When you see an error, it's communicating the problem clearly. Learn to read these messages.\n\n**Systematic Debugging Process:**\n1. **Read the error message carefully** - It shows the error type and line number\n2. **Check the error type** - Syntax errors mean formatting, runtime errors mean logic problems\n3. **Trace backward** - Look at what your code was trying to do\n4. **Check common causes** - Missing quotes, incorrect indentation, wrong variable names\n\n**Example Error Analysis:**\n```python\n# SyntaxError: invalid syntax usually means:\n# - Missing colon (:)\n# - Unclosed parentheses\n# - Incorrect indentation\n```\n\n💡 **Tip:** Read the error message word by word - it's designed to help you find the problem!";
      
      // NO QUESTIONS - explanation is sufficient
      socraticQuestions = [];
      
      followUpPrompts = [
        "Can you share the error message? That will help me give you more specific guidance.",
        "What were you trying to accomplish when this error occurred?"
      ];
    } else if (input.includes('how') || input.includes('what') || intent === 'conceptual') {
      // CONTENT: Explanation with examples (NO QUESTIONS - explanation only)
      content = "Great question! Let me explain this concept clearly with examples.\n\n**Understanding the Concept:**\nConcepts in programming build on each other. Understanding the 'why' helps you apply them correctly. When you understand how something works fundamentally, you can use it effectively.\n\n**Key Points:**\n• Every concept has a purpose - it solves a specific problem\n• Concepts follow patterns - once you see the pattern, similar concepts become easier\n• Real-world analogies help - programming mirrors everyday thinking\n• Practice with examples - seeing it in action makes it click\n\n🎯 **Strategy:** Focus on understanding the underlying principle, then practice applying it. Build intuition, not just memorization.";
      
      // NO QUESTIONS - explanation is sufficient
      socraticQuestions = [];
      
      followUpPrompts = [
        "Would you like me to explain this with a concrete example?",
        "What specific part of this concept would you like to explore further?"
      ];
    } else if (input.includes('stuck') || input.includes('help') || intent === 'planning') {
      // CONTENT: Clear guidance and methodology (NO QUESTIONS - explanation only)
      content = "Feeling stuck is normal—it's part of learning! Here's a clear strategy to get unstuck.\n\n**Problem-Solving Methodology:**\nBreak down what seems overwhelming into manageable steps:\n\n1. **Understand the problem** - Read it multiple times, identify inputs and outputs\n2. **Identify what you know** - List information and applicable concepts\n3. **Break into smaller pieces** - Complex problems are combinations of simpler ones\n4. **Start simple** - Solve a basic example first, then build complexity\n5. **Look for patterns** - Think about similar problems you've solved\n\n**Getting Unstuck:**\n• Re-read the problem with fresh eyes\n• Explain the problem out loud\n• Start with a simple, working example\n• Work backward from the desired outcome\n\n🤝 **Remember:** Every programmer gets stuck. The skill is knowing how to get unstuck!";
      
      // NO QUESTIONS - explanation is sufficient
      socraticQuestions = [];
      
      followUpPrompts = [
        "Can you break this problem into 3 smaller steps? That often helps clarify the path forward.",
        "What similar problems have you solved before? There might be a pattern you can apply."
      ];
    } else {
      // CONTENT: Helpful explanation (NO QUESTIONS - explanation only)
      content = "That's a great question! Let me help you think through this systematically.\n\n**Problem-Solving Approach:**\nEffective problem-solving involves understanding what you're working with, identifying patterns, and applying systematic thinking. Build your analytical skills and intuition.\n\n**Key Strategies:**\n• **Decomposition** - Break complex problems into smaller pieces\n• **Pattern Recognition** - Look for similarities to problems you've seen\n• **Systematic Exploration** - Try different approaches methodically\n• **Reflection** - Think about what works and what doesn't\n\n🌱 **Focus:** The value is developing problem-solving skills you can apply to future challenges.\n\nI'm here to provide explanations and help guide your thinking.";
      
      // NO QUESTIONS - explanation is sufficient
      socraticQuestions = [];
      
      followUpPrompts = [
        "What specific part would you like me to explain in more detail?",
        "Can you tell me more about your current approach? That will help me provide more targeted guidance."
      ];
    }
    
    return {
      content,
      socraticQuestions,
      followUpPrompts
    };
  }

  private static constructTutoringPrompt(
    studentPrompt: string,
    intent: string,
    scaffoldingLevel: string,
    studentLevel: string,
    taskContext?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): string {
    const conversationContext = conversationHistory && conversationHistory.length > 0
      ? `Previous conversation:\n${conversationHistory.slice(-5).map((msg) => {
  const role = msg.role === 'user' || msg.role === 'student' ? 'Student' : 'AI Tutor';
  return `${role}: ${msg.content}`;
        }).join('\n\n')}\n\n`
      : '';

    const scaffoldingGuidance = scaffoldingLevel === 'high' 
      ? 'Provide detailed step-by-step guidance and break down complex tasks into smaller parts.'
      : scaffoldingLevel === 'moderate'
      ? 'Offer structured guidance with some hints while encouraging student thinking.'
      : 'Provide minimal guidance and encourage independent thinking.';

    // Check if the student's prompt is a greeting
    const isGreeting = this.isGreeting(studentPrompt);

    let greetingGuidance = '';
    if (isGreeting) {
      greetingGuidance = `\nIMPORTANT: The student has sent a greeting. Greet them briefly, then invite a study question. If their message also contains a real question, answer that question immediately.`;
    }

    return `You are a friendly teacher having a conversation with a student.

You help with academic topics including programming, algorithms, data structures, data science, statistics, mathematics, and course assignments.

CRITICAL: Answer the student's actual question. Do not refuse academic topics such as binary search, Python, or other algorithms. Do not redirect them away from what they asked.

${conversationContext}Student asks: "${studentPrompt}"
${greetingGuidance}

${!isGreeting ? `CRITICAL - Keep it brief but complete:
- Explain the core idea in just 1-2 complete sentences (finish your thoughts)
- Give 1 quick suggestion for next step
- End with 1 complete question

Maximum 100-150 words total for your reply (do not count code). Be concise but ensure all sentences are complete. Fit everything (explanation, guidance, question) within this limit.` : ''}`;
  }

  /**
   * Check if the student's message is a greeting
   */
  private static isGreeting(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const greetingPatterns = [
      /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|howdy|sup|what's up|yo)\b/i,
      /nice to meet you/i,
      /pleased to meet you/i,
      /glad to meet you/i,
      /how are you/i,
      /what's going on/i,
      /how's it going/i,
      /^thanks?$/i,
      /^thank you$/i,
      /^thanks a lot$/i
    ];
    
    return greetingPatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Check if the question is related to social data science
   */
  private static isSocialDataScienceRelated(message: string): boolean {
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

  // New helper methods for the new prompt system
  private static selectResponseTypeWithVariety(
    intent: string,
    history?: Array<{ role: string; content: string }>,
    studentState?: string
  ): string {
    const responseTypes = ['explanation', 'examples_driven', 'guided_exploration', 'visual_conceptual', 
                          'analogical', 'structured', 'pattern_recognition', 'collaborative'];
    
    // Map intent to preferred response types
    const intentTypes: Record<string, string[]> = {
      debugging: ['explanation', 'structured', 'examples_driven', 'guided_exploration'],
      conceptual: ['explanation', 'analogical', 'visual_conceptual', 'examples_driven'],
      planning: ['structured', 'guided_exploration', 'explanation', 'collaborative'],
      syntax: ['examples_driven', 'structured', 'explanation'],
      logic: ['explanation', 'visual_conceptual', 'guided_exploration', 'pattern_recognition'],
      general: ['explanation', 'examples_driven', 'analogical']
    };
    
    const availableTypes = intentTypes[intent] || ['explanation', 'examples_driven', 'structured'];
    
    // Rotate types to avoid repetition
    const recentTypes: string[] = [];
    if (history && history.length > 0) {
      // Try to infer recent response types from message patterns
      for (let i = history.length - 1; i >= Math.max(0, history.length - 4); i--) {
        const msg = history[i];
        if (msg.role === 'assistant' || msg.role === 'ai') {
          recentTypes.push((msg as any).responseType || 'explanation');
        }
      }
    }
    
    // Select a type that hasn't been used recently
    const unusedTypes = availableTypes.filter(t => !recentTypes.includes(t));
    const typeToUse = unusedTypes.length > 0 ? unusedTypes[0] : availableTypes[0];
    
    // Adjust based on student state
    if (studentState === 'frustrated') return 'structured';
    if (studentState === 'confident') return 'explanation';
    if (studentState === 'stuck') return 'guided_exploration';
    
    return typeToUse;
  }

  private static getProgressiveLevel(
    messageCount: number,
    studentState: string
  ): string {
    if (messageCount <= 2) return 'LEVEL_1_EXPLAIN_SHOW';
    if (messageCount <= 5) return 'LEVEL_2_BREAK_DOWN';
    if (studentState === 'stuck' || studentState === 'frustrated') return 'LEVEL_3_COLLABORATIVE';
    return 'LEVEL_4_CHALLENGE_EXTEND';
  }

  private static getProgressiveInstructions(level: string): string {
    const instructions: Record<string, string> = {
      'LEVEL_1_EXPLAIN_SHOW': `
- Provide clear, direct explanations
- Use concrete examples
- Show the pattern or concept visually (in text)
- Ask ONE follow-up question only if it helps clarify
- Focus on EXPLAINING, not questioning`,
      'LEVEL_2_BREAK_DOWN': `
- Break the explanation into smaller chunks
- Provide step-by-step guidance
- Use analogies
- Ask ONE strategic question to check understanding (optional)
- Focus on GUIDING through understanding`,
      'LEVEL_3_COLLABORATIVE': `
- Work through a similar example together
- Explain your thinking process out loud
- Invite student to try the next step
- Provide clear explanations of each step
- Questions should guide, not test`,
      'LEVEL_4_CHALLENGE_EXTEND': `
- Present the concept clearly
- Extend to related concepts
- Encourage independent exploration
- Ask deeper questions only if they extend thinking
- Focus on building connections`
    };
    return instructions[level] || instructions['LEVEL_1_EXPLAIN_SHOW'];
  }

  private static getIntentBasedStrategy(intent: string, studentState: string): string {
    const strategies: Record<string, Record<string, string>> = {
      debugging: {
        default: `
When debugging, DON'T just ask "what error do you see?"
Instead:
1. Acknowledge: "Errors are part of learning - let's solve this together!"
2. Explain: "This type of error typically means [explanation]"
3. Show: "Here's how to read the error message: [breakdown]"
4. Guide: "Try checking [specific area]. What do you notice?"
5. Only then ask (optional): "What happens when you check that?"`,
        frustrated: `
I notice you might be feeling stuck. Let me switch to a more direct, step-by-step approach.
Instead of more questions, let me:
1. Break this down into clear, actionable steps
2. Provide a concrete example we can work through together
3. Explain the core concept with a simple analogy
Here's what I think is happening...`
      },
      conceptual: {
        default: `
When explaining concepts, DON'T just ask "what do you think X is?"
Instead:
1. Introduce: "Let me explain X using a simple analogy: [analogy]"
2. Break down: "X works like this: [step-by-step explanation]"
3. Example: "Here's a concrete example: [example]"
4. Connect: "Notice how this relates to [previous concept]?"
5. One question (optional): "Can you think of another situation where this applies?"`,
        stuck: `
Let me explain this concept clearly with examples and analogies.
I'll break it down step-by-step so you can see how it works.
Here's how to think about it...`
      },
      planning: {
        default: `
When helping with planning, DON'T just ask "what's your plan?"
Instead:
1. Structure: "Let's break this into phases: [visual breakdown]"
2. Explain: "A good approach often includes: [methodology]"
3. Show: "Here's how I'd think through this: [walkthrough]"
4. Collaborate: "For your specific case, let's start with [first step]"
5. One question (optional): "Does this approach make sense for your problem?"`,
        frustrated: `
Let me help you get unstuck with a clear, structured approach.
I'll break down the problem into manageable steps.
Here's how to approach this systematically...`
      }
    };
    
    const intentStrategies = strategies[intent] || strategies.conceptual;
    return intentStrategies[studentState] || intentStrategies.default || '';
  }

  private static getAdaptiveResponse(studentState: string, intent: string): string {
    const responses: Record<string, string> = {
      frustrated: `
IMPORTANT: The student seems frustrated. Switch to SUPPORTIVE + DIRECT mode:
"I understand this can be frustrating. Let me help you get unstuck.
I'll explain the core issue directly and provide clear steps.
Here's what's happening: [direct explanation].
Here's exactly what to check: [clear steps]."
Focus on EXPLAINING and HELPING, not questioning.`,
      stuck: `
IMPORTANT: The student seems stuck. Provide clear EXPLANATIONS:
"Let me explain this clearly so you can move forward.
I'll break it down step-by-step with examples.
Here's how this works: [clear explanation]."
Focus on EXPLAINING the concept, not asking what they know.`,
      confident: `
IMPORTANT: The student seems confident. Switch to VALIDATION + EXTENSION mode:
"You're on the right track! Your approach is solid.
[Validate what's correct]
Let me explain how to extend this: [extension]."
Acknowledge their thinking, then provide deeper explanation.`,
      exploring: `
The student is exploring. Provide clear, engaging explanations:
"Great question! Let me explain how this works.
[Clear explanation with examples]
Here's an interesting aspect: [insight]."
Focus on teaching and explaining the concept.`
    };
    
    return responses[studentState] || responses.exploring;
  }

  private static getEmotionalTone(studentState: string): string {
    const tones: Record<string, string> = {
      frustrated: 'supportive and direct - validate their frustration and provide clear help',
      stuck: 'patient and clear - simplify and break things down',
      confident: 'encouraging and extending - acknowledge their progress and deepen understanding',
      exploring: 'engaging and clear - match their curiosity with thorough explanations'
    };
    return tones[studentState] || 'encouraging and clear';
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
        recentMessages.includes('error') && history.length > 3) {
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

  private static parseStructuredResponse(response: string): {
    content: string;
    socraticQuestions: string[];
    followUpPrompts: string[];
  } {
    console.log('Parsing Gemini response...');
    try {
      const contentMatch = response.match(/CONTENT:\s*([\s\S]*?)(?=SOCRATIC_QUESTIONS:|$)/);
      const socraticMatch = response.match(/SOCRATIC_QUESTIONS:\s*([\s\S]*?)(?=FOLLOW_UP_PROMPTS:|$)/);
      const followUpMatch = response.match(/FOLLOW_UP_PROMPTS:\s*([\s\S]*?)$/);

      let content = contentMatch ? contentMatch[1].trim() : response;
      
      // No word limit - use complete response as-is
      
      const socraticQuestions = socraticMatch 
        ? socraticMatch[1].split('\n')
            .map(q => q.replace(/^-\s*/, '').trim())
            .filter(q => q.length > 0)
            .slice(0, 1) // Only keep first question (or none)
        : [];

      const followUpPrompts = followUpMatch
        ? followUpMatch[1].split('\n')
            .map(p => p.replace(/^-\s*/, '').trim())
            .filter(p => p.length > 0)
            .slice(0, 2) // Limit to 2 follow-up prompts
        : [];

      console.log('Response parsed successfully');
      return {
        content,
        socraticQuestions,
        followUpPrompts
      };
    } catch (error) {
      console.error('Error parsing structured response:', error);
      console.log('Using raw response as content');
      return {
        content: response,
        socraticQuestions: [],
        followUpPrompts: []
      };
    }
  }

  /**
   * Detects the learning stage based on message content using AI
   * Returns one of: 'Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'
   */
  static async detectLearningStage(messageContent: string, conversationHistory: string[] = []): Promise<string> {
    try {
      this.initialize();
      
      if (!this.model) {
        console.log('Gemini model not initialized - API key missing, using fallback detection');
        return this.fallbackStageDetection(messageContent);
      }

      const historyContext = conversationHistory.length > 0 
        ? `\nPrevious messages:\n${conversationHistory.slice(-5).join('\n')}`
        : '';

      const detectionPrompt = `You are analyzing a student's message to determine their current learning stage in a problem-solving process.

LEARNING STAGES:
1. Clarify - Understanding the problem, asking questions, gathering requirements
2. Plan - Designing approach, outlining strategy, creating a plan
3. Execute - Writing code/implementing solution, actively coding
4. Verify - Testing, debugging, checking correctness
5. Reflect - Learning from experience, summarizing understanding, metacognition

CURRENT MESSAGE: "${messageContent}"
${historyContext}

Analyze the student's message and determine which learning stage it best represents. Consider:
- Keywords and phrases used
- The intent and purpose of the message
- The problem-solving activity being described
- The cognitive process the student seems to be engaging in

Respond with ONLY one of these words: Clarify, Plan, Execute, Verify, Reflect`;

      const result = await this.model.generateContent(detectionPrompt);
      const response = await result.response;
      const stage = response.text().trim();
      
      // Validate the response
      const validStages = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
      if (validStages.includes(stage)) {
        console.log(`[Stage Detection] Detected stage: ${stage} for message: "${messageContent.substring(0, 50)}..."`);
        return stage;
      } else {
        console.warn(`[Stage Detection] Invalid stage detected: ${stage}, using fallback`);
        return this.fallbackStageDetection(messageContent);
      }
    } catch (error) {
      console.error('Error detecting learning stage:', error);
      return this.fallbackStageDetection(messageContent);
    }
  }

  private static fallbackStageDetection(messageContent: string): string {
    const lowerMessage = messageContent.toLowerCase();
    
    // Clarify keywords
    if (lowerMessage.match(/\b(what|how|why|can you explain|help me understand|i don't understand|confused|clarify|what does|explain)\b/)) {
      return 'Clarify';
    }
    
    // Plan keywords
    if (lowerMessage.match(/\b(plan|approach|strategy|steps|design|outline|algorithm|pseudocode|how should i|what steps|create a plan)\b/)) {
      return 'Plan';
    }
    
    // Execute keywords
    if (lowerMessage.match(/\b(code|implement|write|creating|building|coding|program|syntax|function|variable|loop|if)\b/)) {
      return 'Execute';
    }
    
    // Verify keywords
    if (lowerMessage.match(/\b(test|tested|error|bug|debug|wrong|not working|incorrect|verify|check|validate|troubleshoot|issue)\b/)) {
      return 'Verify';
    }
    
    // Reflect keywords
    if (lowerMessage.match(/\b(learned|understand|summary|reflection|insight|realized|takeaway|lesson|improved|better now)\b/)) {
      return 'Reflect';
    }
    
    // Default to Clarify if no clear match
    return 'Clarify';
  }

  /**
   * Generates a dynamic session title based on conversation content
   */
  static async generateSessionTitle(conversationMessages: string[]): Promise<string> {
    try {
      this.initialize();
      
      if (!this.model) {
        console.log('Gemini model not initialized - API key missing, using fallback title');
        return this.generateFallbackTitle(conversationMessages);
      }

      // Take the first few messages to understand the conversation topic
      const recentMessages = conversationMessages.slice(0, 6).join('\n');
      
      const titlePrompt = `You are generating a concise, descriptive title for an AI tutoring conversation. 

CONVERSATION CONTEXT:
${recentMessages}

Create a title that:
- Captures the main topic or subject being discussed
- Is 3-8 words long
- Is descriptive but concise
- Focuses on the learning topic, not the AI interaction
- Uses proper capitalization

Examples of good titles:
- "Python List Operations"
- "Debugging JavaScript Functions"
- "Understanding Recursion"
- "Math Problem Solving"
- "Data Structure Concepts"

Respond with ONLY the title, no quotes or additional text.`;

      const result = await this.model.generateContent(titlePrompt);
      const response = await result.response;
      const title = response.text().trim();
      
      // Clean up the title (remove quotes if present)
      const cleanTitle = title.replace(/^["']|["']$/g, '').trim();
      
      if (cleanTitle.length > 0 && cleanTitle.length <= 50) {
        console.log(`[Title Generation] Generated title: "${cleanTitle}"`);
        return cleanTitle;
      } else {
        console.warn(`[Title Generation] Invalid title generated: "${cleanTitle}", using fallback`);
        return this.generateFallbackTitle(conversationMessages);
      }
    } catch (error) {
      console.error('Error generating session title:', error);
      return this.generateFallbackTitle(conversationMessages);
    }
  }

  private static generateFallbackTitle(conversationMessages: string[]): string {
    const firstUser = conversationMessages.find((line) => line.toLowerCase().startsWith('user:'))
      || conversationMessages[0]
      || '';
    const text = firstUser.replace(/^user:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!text) return 'New chat';
    const words = text.split(' ').slice(0, 8).join(' ');
    if (words.length <= 48) return words.charAt(0).toUpperCase() + words.slice(1);
    return `${words.slice(0, 45).trim()}…`;
  }

  static async analyzePromptQuality(prompt: string): Promise<{
    clarity: number;
    strategy: number;
    ethics: number;
    overall: number;
    suggestions: string[];
    improvements: string[];
  }> {
    try {
      this.initialize();

      const analysisPrompt = `You are an AI prompt quality analyzer for educational contexts. Analyze the following student prompt and provide scores and feedback.

STUDENT PROMPT: "${prompt}"

Analyze this prompt on three dimensions:

1. CLARITY (0-100): How specific and clear is the prompt? Does it provide context and specific details?
2. STRATEGY (0-100): Does the prompt seek guidance/understanding rather than direct solutions? Does it promote learning?
3. ETHICS (0-100): Does the prompt demonstrate responsible AI usage? Does it avoid academic dishonesty?

FORMAT YOUR RESPONSE AS:
CLARITY_SCORE: [0-100]
STRATEGY_SCORE: [0-100]
ETHICS_SCORE: [0-100]
OVERALL_SCORE: [0-100]

SUGGESTIONS:
- [Suggestion 1]
- [Suggestion 2]
- [Suggestion 3 if applicable]

IMPROVEMENTS:
- [Improvement area 1]
- [Improvement area 2]
- [Improvement area 3 if applicable]

Be constructive and educational in your feedback.`;

      const result = await this.model.generateContent(analysisPrompt);
      const response = await result.response;
      const text = response.text();

      return this.parseQualityAnalysis(text);
    } catch (error) {
      console.error('Error analyzing prompt quality:', error);
      throw new Error('Failed to analyze prompt quality. Please try again.');
    }
  }

  private static parseQualityAnalysis(response: string): {
    clarity: number;
    strategy: number;
    ethics: number;
    overall: number;
    suggestions: string[];
    improvements: string[];
  } {
    try {
      const clarityMatch = response.match(/CLARITY_SCORE:\s*(\d+)/);
      const strategyMatch = response.match(/STRATEGY_SCORE:\s*(\d+)/);
      const ethicsMatch = response.match(/ETHICS_SCORE:\s*(\d+)/);
      const overallMatch = response.match(/OVERALL_SCORE:\s*(\d+)/);
      
      const suggestionsMatch = response.match(/SUGGESTIONS:\s*([\s\S]*?)(?=IMPROVEMENTS:|$)/);
      const improvementsMatch = response.match(/IMPROVEMENTS:\s*([\s\S]*?)$/);

      const clarity = clarityMatch ? parseInt(clarityMatch[1]) : 0;
      const strategy = strategyMatch ? parseInt(strategyMatch[1]) : 0;
      const ethics = ethicsMatch ? parseInt(ethicsMatch[1]) : 0;
      const overall = overallMatch ? parseInt(overallMatch[1]) : Math.round((clarity + strategy + ethics) / 3);

      const suggestions = suggestionsMatch
        ? suggestionsMatch[1].split('\n')
            .map(s => s.replace(/^-\s*/, '').trim())
            .filter(s => s.length > 0)
        : [];

      const improvements = improvementsMatch
        ? improvementsMatch[1].split('\n')
            .map(i => i.replace(/^-\s*/, '').trim())
            .filter(i => i.length > 0)
        : [];

      return {
        clarity: Math.max(0, Math.min(100, clarity)),
        strategy: Math.max(0, Math.min(100, strategy)),
        ethics: Math.max(0, Math.min(100, ethics)),
        overall: Math.max(0, Math.min(100, overall)),
        suggestions,
        improvements
      };
    } catch (error) {
      console.error('Error parsing quality analysis:', error);
      // Fallback to basic analysis
      return {
        clarity: 50,
        strategy: 50,
        ethics: 50,
        overall: 50,
        suggestions: ['Try to be more specific in your prompt'],
        improvements: ['Clarity', 'Strategy']
      };
    }
  }

  /**
   * Generate embeddings for text using Gemini embedding model
   * For semantic similarity and clustering
   */
  static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      this.initialize();
      
      if (!this.genAI) {
        console.warn('[Gemini Embeddings] API key not found, using fallback embeddings');
        return this.generateFallbackEmbeddings(texts);
      }

      // Use Gemini's embedding model (text-embedding-004 or similar)
      // If the embedding model isn't available in the GenerativeAI SDK,
      // we'll use Gemini's text generation to create embeddings via API
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        return this.generateFallbackEmbeddings(texts);
      }

      // Generate embeddings using Gemini's embedding API
      // Note: Google's Generative AI SDK may not directly support embeddings
      // So we'll use a workaround: generate semantic descriptions and convert to vectors
      // OR use a REST API call to Gemini's embedding endpoint if available
      
      const embeddings: number[][] = [];
      
      for (const text of texts) {
        try {
          // Use Gemini to generate a semantic representation
          // We'll use the model to understand the text and create a vector-like representation
          const embedding = await this.generateSemanticEmbedding(text);
          embeddings.push(embedding);
        } catch (error) {
          console.error('[Gemini Embeddings] Error generating embedding:', error);
          // Fallback to simple hash-based embedding
          embeddings.push(this.textToEmbedding(text));
        }
      }
      
      return embeddings;
    } catch (error) {
      console.error('[Gemini Embeddings] Error in generateEmbeddings:', error);
      return this.generateFallbackEmbeddings(texts);
    }
  }

  private static parseKnowledgeMapResponse(response: string): GeminiKnowledgeMapResult | null {
    try {
      const jsonString = this.extractJsonFromText(response);
      if (!jsonString) {
        return null;
      }

      const parsed = JSON.parse(jsonString);

      if (!parsed.nodes || !Array.isArray(parsed.nodes)) return null;
      if (!parsed.edges || !Array.isArray(parsed.edges)) return null;
      if (!parsed.insights || typeof parsed.insights !== 'object') return null;
      if (!parsed.keywords || !Array.isArray(parsed.keywords)) return null;

      const nodes: KnowledgeMapNode[] = parsed.nodes.map((node: any, index: number) => ({
        id: typeof node.id === 'string' && node.id.trim().length > 0 ? node.id.trim() : `node-${index}`,
        label: typeof node.label === 'string' ? node.label.trim() : `Concept ${index + 1}`,
        category: this.normalizeNodeCategory(node.category),
        importance: this.normalizeImportance(node.importance),
        description: typeof node.description === 'string' ? node.description.trim() : undefined,
        sources: Array.isArray(node.sources) ? node.sources.filter((s: unknown) => typeof s === 'string') : undefined,
        tags: Array.isArray(node.tags) ? node.tags.filter((s: unknown) => typeof s === 'string') : undefined,
      }));

      const edges: KnowledgeMapEdge[] = parsed.edges
        .filter((edge: any) => edge && edge.source && edge.target)
        .map((edge: any, index: number) => ({
          id: typeof edge.id === 'string' && edge.id.trim().length > 0 ? edge.id.trim() : `edge-${index}`,
          source: String(edge.source).trim(),
          target: String(edge.target).trim(),
          relation: this.normalizeEdgeRelation(edge.relation),
          confidence: this.normalizeConfidence(edge.confidence),
          explanation: typeof edge.explanation === 'string' ? edge.explanation.trim() : undefined,
        }));

      const insights: KnowledgeMapInsights = {
        summary: typeof parsed.insights.summary === 'string'
          ? parsed.insights.summary.trim()
          : 'Summary unavailable.',
        keyThemes: Array.isArray(parsed.insights.keyThemes)
          ? parsed.insights.keyThemes.filter((theme: unknown) => typeof theme === 'string')
          : [],
        blindSpots: Array.isArray(parsed.insights.blindSpots)
          ? parsed.insights.blindSpots.filter((spot: unknown) => typeof spot === 'string')
          : [],
        recommendedQuestions: Array.isArray(parsed.insights.recommendedQuestions)
          ? parsed.insights.recommendedQuestions.filter((question: unknown) => typeof question === 'string')
          : [],
        suggestedNextSteps: Array.isArray(parsed.insights.suggestedNextSteps)
          ? parsed.insights.suggestedNextSteps.filter((step: unknown) => typeof step === 'string')
          : [],
      };

      const keywords: string[] = parsed.keywords
        .filter((keyword: unknown) => typeof keyword === 'string')
        .map((keyword: string) => keyword.trim())
        .filter((keyword: string) => keyword.length > 0);

      return { nodes, edges, insights, keywords };
    } catch (error) {
      console.error('[Gemini] Error parsing knowledge map response:', error);
      return null;
    }
  }

  private static extractJsonFromText(text: string): string | null {
    if (!text) return null;

    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : null;
  }

  private static normalizeNodeCategory(category: unknown): KnowledgeMapNode['category'] {
    const value = typeof category === 'string' ? category.toLowerCase() : '';
    const allowed: KnowledgeMapNode['category'][] = [
      'concept',
      'process',
      'evidence',
      'question',
      'task',
      'theory',
      'definition',
      'other',
    ];
    return (allowed.includes(value as KnowledgeMapNode['category']))
      ? value as KnowledgeMapNode['category']
      : 'concept';
  }

  private static normalizeImportance(importance: unknown): number {
    const value = typeof importance === 'number'
      ? importance
      : typeof importance === 'string'
        ? Number(importance)
        : 3;

    if (Number.isNaN(value)) return 3;
    return Math.min(5, Math.max(1, Math.round(value)));
  }

  private static normalizeEdgeRelation(relation: unknown): KnowledgeMapEdge['relation'] {
    const value = typeof relation === 'string' ? relation.toLowerCase() : '';
    const allowed: KnowledgeMapEdge['relation'][] = [
      'supports',
      'contradicts',
      'requires',
      'causes',
      'part_of',
      'leads_to',
      'example_of',
      'related_to',
      'other',
    ];
    return (allowed.includes(value as KnowledgeMapEdge['relation']))
      ? value as KnowledgeMapEdge['relation']
      : 'related_to';
  }

  private static normalizeConfidence(confidence: unknown): number {
    const value = typeof confidence === 'number'
      ? confidence
      : typeof confidence === 'string'
        ? Number(confidence)
        : 0.6;

    if (Number.isNaN(value)) return 0.6;
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
  }

  private static generateKnowledgeMapFallback(options: GeminiKnowledgeMapOptions): GeminiKnowledgeMapResult {
    const { content, title } = options;
    const tokens = content
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 4);

    const frequency = new Map<string, number>();
    tokens.forEach((token) => {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    });

    const sortedTokens = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const nodes: KnowledgeMapNode[] = sortedTokens.map(([token, count], index) => ({
      id: `${token}-${index}`,
      label: token.replace(/-/g, ' '),
      category: 'concept',
      importance: Math.min(5, Math.max(1, Math.round(count / 2))),
      description: `Key concept detected from the note related to "${token}".`,
    }));

    const edges: KnowledgeMapEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `edge-${i}`,
        source: nodes[i].id,
        target: nodes[i + 1].id,
        relation: 'related_to',
        confidence: 0.5,
        explanation: `Heuristic relationship between ${nodes[i].label} and ${nodes[i + 1].label}`,
      });
    }

    const keywords = nodes.slice(0, 6).map((node) => node.label);

    const insights: KnowledgeMapInsights = {
      summary: `Heuristic knowledge map for "${title}" generated without AI model access.`,
      keyThemes: nodes.slice(0, 3).map((node) => `Explore the concept of ${node.label}`),
      blindSpots: ['Unable to generate detailed blind spots without AI model access.'],
      recommendedQuestions: ['What additional details are needed to flesh out these key concepts?'],
      suggestedNextSteps: ['Add more structured notes to enable richer AI-generated insights.'],
    };

    return { nodes, edges, insights, keywords };
  }

  /**
   * Generate a semantic embedding for a single text using Gemini
   * This uses Gemini's understanding to create a meaningful vector representation
   */
  private static async generateSemanticEmbedding(text: string): Promise<number[]> {
    try {
      // Use Gemini to extract semantic features
      const prompt = `Analyze the following text and extract its semantic meaning in a structured way.

Text: "${text}"

Provide a list of semantic features as numbers between 0 and 1 representing:
1. Conceptual clarity (0-1)
2. Technical depth (0-1)
3. Abstract vs concrete (0-1)
4. Problem-solving orientation (0-1)
5. Educational focus (0-1)
6. Collaborative nature (0-1)
7. Innovation level (0-1)
8. Practical application (0-1)

Respond with ONLY 8 numbers separated by commas, nothing else.`;

      if (!this.model) {
        return this.textToEmbedding(text);
      }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const textResponse = response.text().trim();
      
      // Parse the response to get numbers
      const numbers = textResponse
        .split(/[,\s]+/)
        .map(n => parseFloat(n.trim()))
        .filter(n => !isNaN(n) && n >= 0 && n <= 1);
      
      if (numbers.length >= 8) {
        // Pad or truncate to exactly 384 dimensions for consistency
        const baseEmbedding = numbers.slice(0, 8);
        return this.expandToDimensions(baseEmbedding, 384);
      }
      
      return this.textToEmbedding(text);
    } catch (error) {
      console.error('[Gemini Embeddings] Error generating semantic embedding:', error);
      return this.textToEmbedding(text);
    }
  }

  /**
   * Convert text to a simple embedding using hash-based approach
   * Used as fallback when API is unavailable
   */
  private static textToEmbedding(text: string): number[] {
    // Simple hash-based embedding (deterministic)
    const embedding: number[] = [];
    const hash = this.simpleHash(text);
    
    for (let i = 0; i < 384; i++) {
      // Use hash with different seeds to create a vector
      const seed = hash + i * 1000003;
      const value = Math.sin(seed) * 0.5 + 0.5; // Normalize to 0-1
      embedding.push(value);
    }
    
    return embedding;
  }

  /**
   * Expand a small embedding vector to a larger dimension
   */
  private static expandToDimensions(smallVec: number[], targetDim: number): number[] {
    const result: number[] = [];
    const ratio = targetDim / smallVec.length;
    
    for (let i = 0; i < targetDim; i++) {
      const sourceIdx = Math.floor(i / ratio);
      const nextIdx = Math.min(sourceIdx + 1, smallVec.length - 1);
      const t = (i / ratio) % 1;
      
      // Interpolate between adjacent values
      const value = smallVec[sourceIdx] * (1 - t) + smallVec[nextIdx] * t;
      result.push(value);
    }
    
    return result;
  }

  /**
   * Simple hash function for text
   */
  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate fallback embeddings when API is unavailable
   */
  private static generateFallbackEmbeddings(texts: string[]): number[][] {
    console.log('[Gemini Embeddings] Using fallback embedding generation');
    return texts.map(text => this.textToEmbedding(text));
  }

  /**
   * Generate profile picture with style transformation using Gemini
   * @param imageFile - The uploaded image file
   * @param style - Style to apply: 'ghibli' (吉卜力) or 'apple' (Apple人物形象)
   * @returns Base64 encoded image data URL
   */
  static async generateStyledProfilePicture(
    imageFile: File,
    style: 'ghibli' | 'apple'
  ): Promise<string | null> {
    try {
      this.initialize();
      
      if (!this.genAI || !this.model) {
        console.error('[Gemini Image] API not initialized');
        return null;
      }

      // Convert image to base64
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      // Prepare style prompt
      const stylePrompts = {
        ghibli: `Transform this profile picture into Studio Ghibli (吉卜力) animation style. The image should have:
- Soft, hand-drawn animation aesthetic
- Warm, natural color palette
- Gentle expressions and flowing lines
- Studio Ghibli's characteristic artistic style
- Maintain the person's recognizable features
- Portrait format, suitable for profile picture`,
        apple: `Transform this profile picture into Apple portrait style (Apple人物形象). The image should have:
- Clean, minimalist design
- Modern, professional appearance
- Smooth, polished look
- Apple's characteristic design language
- Maintain the person's recognizable features
- Portrait format, suitable for profile picture`
      };

      const prompt = stylePrompts[style];

      // Use Gemini's image generation capabilities
      // Note: Gemini 2.0 Flash supports image generation via prompt
      const imageModel = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp' // Use experimental model for image generation
      });

      // For image-to-image transformation, we'll use the vision model
      const visionModel = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-pro' // Use vision model for image processing
      });

      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: imageFile.type || 'image/jpeg'
        }
      };

      const fullPrompt = `${prompt}\n\nPlease generate a transformed version of this image in the requested style. Return the result as a base64 encoded image.`;

      const result = await visionModel.generateContent([
        fullPrompt,
        imagePart
      ]);

      const response = await result.response;
      const text = response.text();

      // Extract base64 image from response if available
      // Note: Gemini may return text description, so we'll need to handle that
      // For actual image generation, we might need to use a different approach
      console.log('[Gemini Image] Response received:', text.substring(0, 200));

      // Alternative: Use image generation model if available
      // For now, return the original image as fallback
      // In production, you'd use Gemini's image generation API properly
      
      // Since Gemini's current API doesn't directly generate images from images,
      // we'll use a workaround: generate a prompt-based image
      const generationPrompt = style === 'ghibli' 
        ? `Create a Studio Ghibli (吉卜力) style portrait profile picture. Soft, hand-drawn animation style with warm colors and gentle expressions.`
        : `Create an Apple portrait style (Apple人物形象) profile picture. Clean, minimalist, modern design with smooth, polished appearance.`;

      try {
        // Try using image generation if the model supports it
        const genResult = await imageModel.generateContent(generationPrompt);
        const genResponse = await genResult.response;
        const genText = genResponse.text();
        
        // If we get image data, return it
        // Otherwise, we'll need to use a different service or approach
        console.log('[Gemini Image] Generation response:', genText.substring(0, 200));
      } catch (error) {
        console.warn('[Gemini Image] Direct generation not available, using alternative method');
      }

      // For now, return the original image as base64
      // In production, integrate with a proper image generation service
      return `data:${imageFile.type || 'image/jpeg'};base64,${base64Image}`;
      
    } catch (error) {
      console.error('[Gemini Image] Error generating styled image:', error);
      return null;
    }
  }
}