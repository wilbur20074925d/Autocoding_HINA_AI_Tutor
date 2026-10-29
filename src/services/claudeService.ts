import { OpenRouterService } from './openRouterService';

export class ClaudeService {
  // No longer need to manage API key directly - OpenRouter handles it

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

  static async generateContent(prompt: string, activeRole: string | null = null, options?: { max_tokens?: number }): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    console.log(`[Claude-${requestId}] Starting generateContent request via OpenRouter`);
    console.log(`[Claude-${requestId}] Prompt length: ${prompt.length}`);
    
    try {
      // Build simple conversational system prompt - no complex training
      let systemPrompt = `You are a friendly teacher having a conversation with a student.

CRITICAL - Keep it brief but complete:
- Explain the core idea in just 1-2 complete sentences (finish your thoughts)
- Give 1 quick suggestion for next step
- End with 1 complete question

Maximum 100-150 words total for your reply (do not count code). Be concise but ensure all sentences are complete. Fit everything (explanation, guidance, question) within this limit.`;

      // No role-specific training - keep it simple and conversational
      
      console.log(`[Claude-${requestId}] Sending request to OpenRouter (Claude Sonnet 4.5)...`);
      
      // Use OpenRouter service with Claude Sonnet 4.5 model - limit to 100-150 words
      const response = await OpenRouterService.generateContentWithRetry(
        OpenRouterService.MODELS.CLAUDE_SONNET_4_5,
        prompt,
        systemPrompt,
        {
          max_tokens: options?.max_tokens || 200, // Limit to ~100-150 words
          temperature: 0.7,
          retries: 3
        }
      );
      
      const duration = Date.now() - startTime;
      console.log(`[Claude-${requestId}] Success! Response length: ${response.length}, Duration: ${duration}ms`);
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Claude-${requestId}] Error after ${duration}ms:`, error);
      return this.generateFallbackResponse(prompt);
    }
  }

  private static generateFallbackResponse(prompt: string): string {
    console.log('[Claude] Generating fallback response for prompt:', prompt.substring(0, 100));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('code') || lowerPrompt.includes('python')) {
      return `# Generated Python code based on your question
def main():
    # Your program logic here
    print("Hello, World!")
    
    # Add your implementation based on your question
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
}
