export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekStreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface AIClientOptions {
  model?: "deepseek-flash" | "deepseek-v4-pro" | string;
  userId: string;
  apiKey?: string;
  anthropicApiKey?: string;
  onTelemetry?: (usage: any, provider: string, ttft: number, failover: boolean) => void;
}

export class AIClient {
  private deepseekEndpoint = process.env.DEEPSEEK_BASE_URL ? `${process.env.DEEPSEEK_BASE_URL}/chat/completions` : "https://api.deepseek.com/chat/completions";
  private anthropicEndpoint = "https://api.anthropic.com/v1/messages";

  constructor(private options: AIClientOptions) {}

  public async generate(messages: AIMessage[], stream: boolean = false) {
    const payload = {
      model: this.options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages,
      stream,
      user_id: this.options.userId,
    };

    let response: Response;
    const startTime = Date.now();
    try {
      response = await fetch(this.deepseekEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey || process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if ([429, 500, 503].includes(response.status)) {
         throw new Error(`Recoverable error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Unrecoverable error: ${response.status}`);
      }

      if (!stream) {
         let text = await response.text();
         text = text.replace(/^(\s*:\s*keep-alive\n)+|^\n+/, '').trim();
         const json = JSON.parse(text);
         if (this.options.onTelemetry) {
            this.options.onTelemetry(json.usage, "deepseek", Date.now() - startTime, false);
         }
         return { response: new Response(JSON.stringify(json), { headers: response.headers }), provider: "deepseek", ttft: Date.now() - startTime };
      }

      return { response, provider: "deepseek", ttft: Date.now() - startTime };
    } catch (e: any) {
      if (e.message.includes("Recoverable error") || e.message.includes("fetch failed") || e.name === "TypeError") {
        const fallbackStartTime = Date.now();
        console.warn(`Falling back to Anthropic due to: ${e.message}`);
        const anthropicPayload = {
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          messages: messages.map(m => ({
             role: m.role,
             content: m.reasoning_content ? `<thinking>${m.reasoning_content}</thinking>\n${m.content}` : m.content
          })).filter(m => m.role !== "system"),
          system: messages.find(m => m.role === "system")?.content,
          stream,
          metadata: { user_id: this.options.userId }
        };

        response = await fetch(this.anthropicEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.options.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(anthropicPayload),
        });

        if (!response.ok) {
           throw new Error(`Fallback failed: ${response.status}`);
        }

        if (!stream) {
           let text = await response.text();
           text = text.replace(/^(\s*:\s*keep-alive\n)+|^\n+/, '').trim();
           const json = JSON.parse(text);
           if (this.options.onTelemetry) {
              this.options.onTelemetry(json.usage, "anthropic", Date.now() - fallbackStartTime, true);
           }
           return { response: new Response(JSON.stringify(json), { headers: response.headers }), provider: "anthropic", ttft: Date.now() - fallbackStartTime };
        }

        return { response, provider: "anthropic", ttft: Date.now() - fallbackStartTime };
      }
      throw e;
    }
  }
}

export async function createDeepSeekChatStream(
  messages: ChatMessage[],
  options?: DeepSeekStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const deepseekEndpoint = process.env.DEEPSEEK_BASE_URL
    ? `${process.env.DEEPSEEK_BASE_URL}/chat/completions`
    : "https://api.deepseek.com/chat/completions";

  const payload = {
    model: options?.model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    messages: [
      { role: "system", content: "You are a concise, threat-analysis focused AXiM SOC operations assistant. Provide technical clarity." },
      ...messages
    ],
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2000,
    stream: true,
  };

  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(deepseekEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          if (attempt < maxRetries) {
            attempt++;
            const backoff = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
        }
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body returned from DeepSeek");
      }

      return response.body;

    } catch (err: any) {
      if (attempt < maxRetries) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to create DeepSeek stream");
}
