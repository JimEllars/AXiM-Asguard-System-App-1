import { deterministicFallbackClassification } from "./threatEngine";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface AIClientOptions {
  model?: "deepseek-flash" | "deepseek-v4-pro" | string;
  userId: string;
  apiKey?: string;
  anthropicApiKey?: string;
  onTelemetry?: (usage: any, provider: string, ttft: number, failover: boolean) => void;
  onError?: (errorMsg: string) => void;
  baseUrl?: string;
  /** Per-attempt inference budget. Hard-capped at AI_TIMEOUT_CEILING_MS. */
  timeoutMs?: number;
}

/**
 * Strict inference budget. A security decision that takes longer than this is
 * worse than no decision at all: the edge request would otherwise hang until
 * the platform kills the isolate mid-response.
 */
export const AI_TIMEOUT_CEILING_MS = 8000;

export const FALLBACK_PROVIDER = "fallback_circuit_breaker";

function resolveTimeout(requested?: number): number {
  if (!requested || !Number.isFinite(requested) || requested <= 0) {
    return AI_TIMEOUT_CEILING_MS;
  }
  return Math.min(requested, AI_TIMEOUT_CEILING_MS);
}

/** Fetch with a hard abort deadline. Rejects with a timeout-flavoured AbortError. */
async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal as any });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A stream consumer expects `text/event-stream`. When we degrade we still emit a
 * well-formed SSE frame carrying the deterministic verdict so the cockpit's
 * parser sees one complete event and then a clean close.
 */
function fallbackResponse(rationale: string, stream: boolean) {
  const body = deterministicFallbackClassification(rationale);
  if (!stream) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Asguard-Degraded": "true" },
    });
  }
  return new Response(`data: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Asguard-Degraded": "true",
    },
  });
}

export class AIClient {
  private anthropicEndpoint = "https://api.anthropic.com/v1/messages";

  constructor(private options: AIClientOptions) {}

  public async generate(messages: AIMessage[], stream: boolean = false) {
    const timeoutMs = resolveTimeout(this.options.timeoutMs);
    const deepseekEndpoint = this.options.baseUrl
      ? `${this.options.baseUrl}/chat/completions`
      : "https://api.deepseek.com/chat/completions";

    const payload = {
      model: this.options.model || "deepseek-flash",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      messages,
      stream,
      user_id: this.options.userId,
    };

    const startTime = Date.now();

    try {
      const response = await fetchWithDeadline(
        deepseekEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.apiKey || process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      );

      if ([429, 500, 503].includes(response.status)) {
        throw new Error(`Recoverable error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Unrecoverable error: ${response.status}`);
      }

      if (!stream) {
        const text = (await response.text()).replace(/^(\s*:\s*keep-alive\n)+|^\n+/, "").trim();
        const json = JSON.parse(text);
        this.options.onTelemetry?.(json.usage, "deepseek", Date.now() - startTime, false);
        return {
          response: new Response(JSON.stringify(json), { headers: response.headers }),
          provider: "deepseek",
          ttft: Date.now() - startTime,
        };
      }

      return { response, provider: "deepseek", ttft: Date.now() - startTime };
    } catch (e: any) {
      const message: string = e?.message || String(e);
      const isRecoverable =
        message.includes("Recoverable error") ||
        message.includes("fetch failed") ||
        message.includes("timeout") ||
        e?.name === "TypeError" ||
        e?.name === "AbortError";

      if (!isRecoverable) {
        this.options.onError?.(message);
        return {
          response: fallbackResponse(message, stream),
          provider: FALLBACK_PROVIDER,
          ttft: Date.now() - startTime,
        };
      }

      // DeepSeek unavailable or over budget — fail over to Anthropic under the
      // same strict deadline.
      const fallbackStartTime = Date.now();
      console.warn(`Falling back to Anthropic due to: ${message}`);

      const anthropicPayload = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        messages: messages
          .map((m) => ({
            role: m.role,
            content: m.reasoning_content ? `<thinking>${m.reasoning_content}</thinking>\n${m.content}` : m.content,
          }))
          .filter((m) => m.role !== "system"),
        system: messages.find((m) => m.role === "system")?.content,
        stream,
        metadata: { user_id: this.options.userId },
      };

      try {
        const response = await fetchWithDeadline(
          this.anthropicEndpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.options.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(anthropicPayload),
          },
          timeoutMs,
        );

        if (!response.ok) {
          throw new Error(`Fallback failed: ${response.status}`);
        }

        if (!stream) {
          const text = (await response.text()).replace(/^(\s*:\s*keep-alive\n)+|^\n+/, "").trim();
          const json = JSON.parse(text);
          this.options.onTelemetry?.(json.usage, "anthropic", Date.now() - fallbackStartTime, true);
          return {
            response: new Response(JSON.stringify(json), { headers: response.headers }),
            provider: "anthropic",
            ttft: Date.now() - fallbackStartTime,
          };
        }

        return { response, provider: "anthropic", ttft: Date.now() - fallbackStartTime };
      } catch (fallbackError: any) {
        const fallbackMessage: string = fallbackError?.message || String(fallbackError);
        console.warn(`Fallback also failed: ${fallbackMessage}`);
        this.options.onError?.(fallbackMessage);
        return {
          response: fallbackResponse(fallbackMessage, stream),
          provider: FALLBACK_PROVIDER,
          ttft: Date.now() - startTime,
        };
      }
    }
  }
}
