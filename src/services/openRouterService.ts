/**
 * OpenRouter Service
 * Unified service for accessing multiple AI models through OpenRouter platform
 * 
 * Models supported:
 * - Google Gemini 3 Flash: google/gemini-3-flash
 * - Google Gemini 2.5 Flash: google/gemini-2.5-flash
 * - Anthropic Claude Sonnet 4.5: anthropic/claude-sonnet-4.5
 * - OpenAI GPT-4: openai/gpt-4
 * - xAI Grok: x-ai/grok-beta
 */

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private static apiKey: string | null = null;
  private static readonly API_BASE_URL = 'https://openrouter.ai/api/v1';
  
  // Model identifiers
  static readonly MODELS = {
    GEMINI_3_FLASH: 'google/gemini-3-flash',
    GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
    CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',
    GPT_4: 'openai/gpt-4',
    GROK_BETA: 'x-ai/grok-beta',
  } as const;

  private static initialize() {
    if (!this.apiKey) {
      this.apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
      console.log('[OpenRouter] Initializing with API key:', this.apiKey ? 'Present' : 'Missing');
      
      if (!this.apiKey) {
        console.warn('[OpenRouter] API key not found. Using fallback responses.');
      }
    }
  }

  /**
   * Generate content using OpenRouter API
   * @param model - Model identifier (e.g., 'google/gemini-2.5-flash' or 'anthropic/claude-sonnet-4.5')
   * @param prompt - User prompt
   * @param systemPrompt - Optional system prompt
   * @param options - Additional options (max_tokens, temperature)
   */
  static async generateContent(
    model: string,
    prompt: string,
    systemPrompt?: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    console.log(`[OpenRouter-${requestId}] Starting generateContent request`);
    console.log(`[OpenRouter-${requestId}] Model: ${model}`);
    console.log(`[OpenRouter-${requestId}] Prompt length: ${prompt.length}`);
    
    try {
      this.initialize();
      
      if (!this.apiKey) {
        console.warn(`[OpenRouter-${requestId}] API key not found - using fallback`);
        return this.generateFallbackResponse(prompt);
      }

      // Build messages array
      const messages: OpenRouterMessage[] = [];
      
      // Add system prompt if provided (for Claude, use system field; for Gemini, add as system message)
      if (systemPrompt) {
        if (model.startsWith('anthropic/')) {
          // Claude uses a separate system field
          // We'll include it in the request body
        } else {
          // For other models, add as system message
          messages.push({
            role: 'system',
            content: systemPrompt
          });
        }
      }
      
      // Add user message
      messages.push({
        role: 'user',
        content: prompt
      });

      // Build request body
      const requestBody: OpenRouterRequest = {
        model,
        messages,
        max_tokens: options?.max_tokens || 4096, // No word limit - allow complete, comprehensive responses
        temperature: options?.temperature || 0.7,
      };

      // Add system prompt to request body for Claude
      if (systemPrompt && model.startsWith('anthropic/')) {
        requestBody.system = systemPrompt;
      }

      console.log(`[OpenRouter-${requestId}] Sending request to OpenRouter API...`);
      
      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      };
      
      // Add optional headers for analytics (if available)
      if (typeof window !== 'undefined' && window.location) {
        headers['HTTP-Referer'] = window.location.origin;
      }
      headers['X-Title'] = 'EDU-AI Platform';
      
      // Call OpenRouter API
      const response = await fetch(`${this.API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[OpenRouter-${requestId}] API error:`, response.status, errorData);
        throw new Error(`OpenRouter API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenRouterResponse = await response.json();
      const duration = Date.now() - startTime;
      
      console.log(`[OpenRouter-${requestId}] Response received in ${duration}ms`);
      
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        console.log(`[OpenRouter-${requestId}] Successfully extracted content, length: ${content.length}`);
        return content;
      }
      
      throw new Error('No content in OpenRouter API response');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[OpenRouter-${requestId}] Error after ${duration}ms:`, error);
      return this.generateFallbackResponse(prompt);
    }
  }

  /**
   * Generate content with retry logic
   */
  static async generateContentWithRetry(
    model: string,
    prompt: string,
    systemPrompt?: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      retries?: number;
    }
  ): Promise<string> {
    const retries = options?.retries || 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.generateContent(model, prompt, systemPrompt, {
          max_tokens: options?.max_tokens,
          temperature: options?.temperature,
        });
      } catch (error: any) {
        lastError = error;
        console.error(`[OpenRouter] Attempt ${attempt}/${retries} failed:`, error.message);
        
        // Don't retry on authentication errors
        if (error.message?.includes('401') || error.message?.includes('auth')) {
          break;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`[OpenRouter] All ${retries} attempts failed, using fallback`);
    return this.generateFallbackResponse(prompt);
  }

  /**
   * Generate fallback response when API fails
   */
  private static generateFallbackResponse(prompt: string): string {
    console.log('[OpenRouter] Generating fallback response for prompt:', prompt.substring(0, 100));
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('code') || lowerPrompt.includes('python')) {
      return `I'm here to help you with your coding question. However, I'm currently experiencing some technical difficulties connecting to the AI service.

Let me guide you through a general approach:
1. Break down your problem into smaller steps
2. Think about what inputs and outputs you need
3. Consider edge cases
4. Test your solution with different inputs

Would you like to try rephrasing your question, or would you prefer to wait a moment and try again?`;
    }
    
    if (lowerPrompt.includes('debug') || lowerPrompt.includes('error')) {
      return "I see you're encountering an issue. Let's work through this systematically:\n\n1. What error message are you seeing?\n2. Which line is causing the problem?\n3. What were you trying to accomplish?\n\nLet's debug this step by step together. Please try again in a moment if the AI service is available.";
    }
    
    return "I'm here to help guide your learning. I'm currently experiencing some technical difficulties, but I'll do my best to assist you. Can you tell me more about what you're working on and what specific challenge you're facing? Please try again in a moment if the issue persists.";
  }
}

