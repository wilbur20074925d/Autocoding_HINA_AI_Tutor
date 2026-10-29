/**
 * ZenMux Service
 * Unified gateway for AI models via ZenMux (https://zenmux.ai/)
 * OpenAI-compatible API; works in regions where OpenRouter may be unavailable (e.g. HK).
 *
 * Models supported (provider/model format):
 * - Google Gemini 2.5 Flash: google/gemini-2.5-flash
 * - Google Gemini 3 Flash: google/gemini-3-flash
 * - Google Gemini 3 Pro Preview: google/gemini-3-pro-preview
 * - Anthropic Claude, OpenAI GPT-4, etc. per ZenMux docs
 */

interface ZenMuxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZenMuxRequest {
  model: string;
  messages: ZenMuxMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

interface ZenMuxResponse {
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

export class ZenMuxService {
  private static apiKey: string | null = null;
  private static readonly API_BASE_URL = 'https://zenmux.ai/api/v1';

  static readonly MODELS = {
    GEMINI_3_FLASH: 'google/gemini-3-flash',
    GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
    GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview',
    CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',
    GPT_4: 'openai/gpt-4',
    GPT_4O: 'openai/gpt-4o',
  } as const;

  private static initialize() {
    if (!this.apiKey) {
      this.apiKey = import.meta.env.VITE_ZENMUX_API_KEY || null;
      console.log('[ZenMux] Initializing with API key:', this.apiKey ? 'Present' : 'Missing');
      if (!this.apiKey) {
        console.warn('[ZenMux] API key not found. Set VITE_ZENMUX_API_KEY in .env');
      }
    }
  }

  /**
   * Generate content using ZenMux API (OpenAI-compatible chat completions)
   */
  static async generateContent(
    model: string,
    prompt: string,
    systemPrompt?: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(`[ZenMux-${requestId}] Starting generateContent request`);
    console.log(`[ZenMux-${requestId}] Model: ${model}`);
    console.log(`[ZenMux-${requestId}] Prompt length: ${prompt.length}`);

    try {
      this.initialize();

      if (!this.apiKey) {
        console.warn(`[ZenMux-${requestId}] API key not found - using fallback`);
        return this.generateFallbackResponse(prompt);
      }

      const messages: ZenMuxMessage[] = [];

      if (systemPrompt) {
        if (model.startsWith('anthropic/')) {
          // Claude: pass system in body
        } else {
          messages.push({ role: 'system', content: systemPrompt });
        }
      }

      messages.push({ role: 'user', content: prompt });

      const requestBody: ZenMuxRequest = {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
      };

      // Only set max_tokens when explicitly provided; otherwise let ZenMux use its default
      if (typeof options?.max_tokens === 'number') {
        requestBody.max_tokens = options.max_tokens;
      }

      if (systemPrompt && model.startsWith('anthropic/')) {
        requestBody.system = systemPrompt;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };

      if (typeof window !== 'undefined' && window.location) {
        headers['HTTP-Referer'] = window.location.origin;
      }

      const response = await fetch(`${this.API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: options?.abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[ZenMux-${requestId}] API error:`, response.status, errorData);
        throw new Error(
          `ZenMux API error: ${response.status} ${errorData.error?.message || response.statusText}`
        );
      }

      const data: ZenMuxResponse = await response.json();
      const duration = Date.now() - startTime;
      console.log(`[ZenMux-${requestId}] Response received in ${duration}ms`);

      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        console.log(`[ZenMux-${requestId}] Success, content length: ${content.length}`);
        return content;
      }

      throw new Error('No content in ZenMux API response');
    } catch (error) {
      const duration = Date.now() - startTime;
      if ((error as Error)?.name === 'AbortError' || options?.abortSignal?.aborted) {
        throw error;
      }
      console.error(`[ZenMux-${requestId}] Error after ${duration}ms:`, error);
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
      abortSignal?: AbortSignal;
    }
  ): Promise<string> {
    const retries = options?.retries ?? 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (options?.abortSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        return await this.generateContent(model, prompt, systemPrompt, {
          max_tokens: options?.max_tokens,
          temperature: options?.temperature,
          abortSignal: options?.abortSignal,
        });
      } catch (error: unknown) {
        if ((error as Error)?.name === 'AbortError' || options?.abortSignal?.aborted) {
          throw error;
        }
        console.error(`[ZenMux] Attempt ${attempt}/${retries} failed:`, (error as Error)?.message);

        if (
          (error as Error)?.message?.includes('401') ||
          (error as Error)?.message?.includes('auth')
        ) {
          break;
        }

        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            options?.abortSignal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          });
        }
      }
    }

    console.error(`[ZenMux] All ${retries} attempts failed, using fallback`);
    return this.generateFallbackResponse(prompt);
  }

  private static generateFallbackResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('code') || lowerPrompt.includes('python')) {
      return `I'm here to help with your coding question. The AI service is temporarily unavailable.

General approach:
1. Break the problem into smaller steps
2. Consider inputs and outputs
3. Think about edge cases
4. Test with different inputs

Would you like to rephrase your question or try again in a moment?`;
    }

    if (lowerPrompt.includes('debug') || lowerPrompt.includes('error')) {
      return "I see you're encountering an issue. Let's work through it:\n\n1. What error message do you see?\n2. Which line is causing the problem?\n3. What were you trying to do?\n\nTry again in a moment if the AI service is available.";
    }

    return "I'm here to help guide your learning. The AI service is temporarily unavailable. Can you tell me more about what you're working on? Please try again in a moment.";
  }
}
