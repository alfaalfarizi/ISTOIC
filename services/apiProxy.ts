import { z } from 'zod';
import { debugService } from './debugService';
import { HANISAH_KERNEL } from './melsaKernel';

/**
 * IStoicAI v0.52 ENTERPRISE PROXY (SECURE HYBRID)
 * 
 * SECURITY UPGRADE:
 * This service now defaults to a Server-First architecture.
 * Client-side execution (Zero Trust Simulation) is available ONLY as a fallback/dev mode.
 * 
 * INSTRUCTIONS:
 * 1. To secure your keys, set VITE_USE_SECURE_BACKEND=true in .env
 * 2. Set VITE_BACKEND_URL to your Cloud Function / API Route (e.g. /api/chat).
 */

// 1. Zod Schema Definitions (Runtime Type Safety)
export const AIResponseSchema = z.object({
  text: z.string(),
  modelUsed: z.string(),
  tokenCount: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  content: z.string(),
  tags: z.array(z.string()),
  created: z.string(),
  updated: z.string(),
  is_pinned: z.boolean().default(false),
  is_archived: z.boolean().default(false),
  tasks: z.array(z.object({
    id: z.string(),
    text: z.string(),
    isCompleted: z.boolean(),
    dueDate: z.string().optional()
  })).optional()
});

export type ValidatedNote = z.infer<typeof NoteSchema>;

// Configuration from Environment
const USE_SECURE_BACKEND = (import.meta as any).env.VITE_USE_SECURE_BACKEND === 'true';
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || '/api/chat';

// --- RELIABILITY UTILITIES ---

/**
 * Retries a fetch operation with exponential backoff.
 * @param url Request URL
 * @param options Fetch options
 * @param retries Max retries (default 3)
 * @param backoffMs Initial backoff in ms (default 1000)
 */
async function fetchWithBackoff(url: string, options: RequestInit, retries = 3, backoffMs = 1000): Promise<Response> {
  try {
    const res = await fetch(url, options);
    // Retry on Server Errors (5xx) but not Client Errors (4xx)
    if (!res.ok && res.status >= 500) {
      throw new Error(`Server Error: ${res.status}`);
    }
    return res;
  } catch (err) {
    if (retries <= 1) throw err;
    
    // Log retry attempt
    debugService.log('WARN', 'PROXY', 'RETRY', `Network/Server fail. Retrying in ${backoffMs}ms...`, { url, retriesLeft: retries - 1 });
    
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    return fetchWithBackoff(url, options, retries - 1, backoffMs * 2);
  }
}

// 2. The Proxy Service
class ApiProxyService {
  
  /**
   * Securely routes a prompt to the configured backend/handler.
   * Enforces Zod schema validation on return.
   */
  async generateText(
    prompt: string, 
    provider: 'GEMINI' | 'OPENAI' | 'GROQ' | 'DEEPSEEK' | 'MISTRAL', 
    modelId: string,
    context?: string
  ): Promise<AIResponse> {
    
    debugService.log('INFO', 'PROXY', 'OUTBOUND', `Routing request to ${provider}/${modelId}`);

    // STRATEGY A: SECURE BACKEND (RECOMMENDED FOR PRODUCTION)
    if (USE_SECURE_BACKEND) {
        try {
            // Updated to use Retry Logic
            const response = await fetchWithBackoff(BACKEND_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': `Bearer ${token}` // Add auth token here if needed
                },
                // Backend expects 'message', 'provider', 'modelId', 'context'
                body: JSON.stringify({ 
                    message: prompt, 
                    provider, 
                    modelId, 
                    context 
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend Error (${response.status}): ${errorText}`);
            }

            // CONSUME STREAM FROM BACKEND
            // The backend returns a ReadableStream (text/plain).
            // We must read it fully to construct the AIResponse object.
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullText += decoder.decode(value, { stream: true });
                }
            }

            // Construct the response object manually since backend returns raw text stream
            const data = {
                text: fullText,
                modelUsed: modelId,
                metadata: { timestamp: new Date().toISOString(), source: 'SERVER_STREAM' }
            };

            return AIResponseSchema.parse(data);

        } catch (serverError: any) {
            console.error("Server Proxy Failed:", serverError);
            // If in production, do not fallback to client-side to prevent key leak
            if ((import.meta as any).env.PROD) {
                throw new Error(`Secure Backend Unreachable: ${serverError.message}`);
            }
        }
    }

    // STRATEGY B: LOCAL EXECUTION (DEV / FALLBACK)
    // WARNING: Exposes keys in client logic.
    console.warn("⚠️ [SECURITY WARNING] RUNNING IN CLIENT-SIDE FALLBACK MODE. API KEYS ARE EXPOSED TO BROWSER.");
    
    try {
      const stream = HANISAH_KERNEL.streamExecute(prompt, modelId, context);
      
      let fullText = "";
      for await (const chunk of stream) {
        if (chunk.text) fullText += chunk.text;
      }

      const rawResponse = {
        text: fullText,
        modelUsed: modelId,
        metadata: { timestamp: new Date().toISOString() }
      };

      // STRICT VALIDATION
      return AIResponseSchema.parse(rawResponse);

    } catch (error) {
      debugService.log('ERROR', 'PROXY', 'VALIDATION_FAIL', 'AI Output failed integrity check', error);
      throw new Error("Secure Proxy Error: Upstream response invalid or failed.");
    }
  }

  /**
   * Securely validates Note data structure before persistence.
   */
  validateNote(data: unknown): ValidatedNote {
    const result = NoteSchema.safeParse(data);
    if (!result.success) {
      console.error("Data Integrity Error:", result.error);
      throw new Error("CRITICAL: Note data corruption detected by Zero Trust layer.");
    }
    return result.data;
  }
}

export const ApiProxy = new ApiProxyService();