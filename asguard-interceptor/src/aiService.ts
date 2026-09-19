export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface AIClientOptions {
  userId: string;
  apiKey?: string;
  anthropicApiKey?: string;
  onTelemetry?: (usage: any, provider: string, ttft: number, failover: boolean) => void;
}

export class AIClient {
  private deepseekEndpoint = "https://api.deepseek.com/chat/completions";
  private anthropicEndpoint = "https://api.anthropic.com/v1/messages";

  constructor(private options: AIClientOptions) {}

  public async generate(messages: AIMessage[], stream: boolean = false) {
    const payload = {
      model: "deepseek-reasoner",
      messages,
      stream,
      user: this.options.userId,
    };

    let response: Response;
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        response = await fetch(this.deepseekEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.apiKey || process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal as any
        });
      } finally {
        clearTimeout(timeout);
      }

      if ([429, 500, 503].includes(response.status)) {
         throw new Error(`Recoverable error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Unrecoverable error: ${response.status}`);
      }

      if (!stream) {
         let text = await response.text();
         text = text.replace(/^(\s*:\s*keep-alive\n)+/, '').trim();
         const json = JSON.parse(text);
         if (this.options.onTelemetry) {
            this.options.onTelemetry(json.usage, "deepseek", Date.now() - startTime, false);
         }
         return { response: new Response(JSON.stringify(json), { headers: response.headers }), provider: "deepseek", ttft: Date.now() - startTime };
      }

      return { response, provider: "deepseek", ttft: Date.now() - startTime };
    } catch (e: any) {
      const isRecoverable = e.message.includes("Recoverable error") || e.message.includes("fetch failed") || e.name === "TypeError" || e.name === "AbortError" || e.message.includes("timeout");

      if (isRecoverable) {
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

        const anthropicController = new AbortController();
        const anthropicTimeout = setTimeout(() => anthropicController.abort(), 8000);

        try {
          try {
            response = await fetch(this.anthropicEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": this.options.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
                "anthropic-version": "2023-06-01"
              },
              body: JSON.stringify(anthropicPayload),
              signal: anthropicController.signal as any
            });
          } finally {
            clearTimeout(anthropicTimeout);
          }

          if (!response.ok) {
             throw new Error(`Fallback failed: ${response.status}`);
          }

          if (!stream) {
             let text = await response.text();
             text = text.replace(/^(\s*:\s*keep-alive\n)+/, '').trim();
             const json = JSON.parse(text);
             if (this.options.onTelemetry) {
                this.options.onTelemetry(json.usage, "anthropic", Date.now() - fallbackStartTime, true);
             }
             return { response: new Response(JSON.stringify(json), { headers: response.headers }), provider: "anthropic", ttft: Date.now() - fallbackStartTime };
          }

          return { response, provider: "anthropic", ttft: Date.now() - fallbackStartTime };
        } catch (fallbackError: any) {
          console.warn(`Fallback also failed: ${fallbackError.message}`);
          return {
            response: new Response(
              JSON.stringify({
                status: "flagged_for_manual_review",
                confidence: 0.0,
                error: fallbackError.message
              }),
              { headers: { "Content-Type": "application/json" } }
            ),
            provider: "fallback_circuit_breaker",
            ttft: Date.now() - startTime
          };
        }
      }

      return {
        response: new Response(
          JSON.stringify({
            status: "flagged_for_manual_review",
            confidence: 0.0,
            error: e.message
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
        provider: "fallback_circuit_breaker",
        ttft: Date.now() - startTime
      };
    }
  }
}
