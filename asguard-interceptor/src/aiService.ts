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
  /** Total request budget. Hard-capped at AI_TIMEOUT_CEILING_MS. */
  timeoutMs?: number;
}

/**
 * Strict inference budget. A security decision that takes longer than this is
 * worse than no decision at all: the edge request would otherwise hang until
 * the platform kills the isolate mid-response.
 */
export const AI_TIMEOUT_CEILING_MS = 8000;

/**
 * Share of the ceiling the primary provider may consume before we give up on
 * it. Reserving the remainder is what makes failover reachable: without it a
 * hung primary eats the whole budget and Anthropic is never dialled.
 */
export const PRIMARY_LEG_BUDGET_SHARE = 0.6;

export const FALLBACK_PROVIDER = "fallback_circuit_breaker";

export function resolveTimeout(requested?: number): number {
  if (!requested || !Number.isFinite(requested) || requested <= 0) {
    return AI_TIMEOUT_CEILING_MS;
  }
  return Math.min(requested, AI_TIMEOUT_CEILING_MS);
}

/**
 * Absolute point in time by which every leg of a single classification must be
 * finished. Budgets are handed out as `remaining()` slices of one clock, so the
 * primary leg, the failover leg and their body reads cannot sum past the
 * ceiling.
 */
interface Deadline {
  readonly at: number;
  remaining(): number;
}

function createDeadline(budgetMs: number): Deadline {
  const at = Date.now() + Math.max(1, budgetMs);
  return {
    at,
    remaining: () => Math.max(0, at - Date.now()),
  };
}

/** Raised when a leg runs out of shared budget. Shaped like an abort so the
 *  existing recoverable-error classification treats it as "try the failover". */
class InferenceDeadlineError extends Error {
  constructor(stage: string) {
    super(`AI deadline exceeded during ${stage}`);
    this.name = "AbortError";
  }
}

interface Leg {
  response: Response;
  /** Releases the abort timer. Call once the body is no longer of interest. */
  disarm: () => void;
}

/**
 * One HTTP leg bounded by the shared deadline.
 *
 * The abort timer deliberately stays armed until `disarm()` is called, and the
 * callers below only disarm *after* the body has been consumed. Clearing the
 * timer as soon as headers arrived — the previous behaviour — left
 * `response.text()` unbounded, so a provider that sent headers and then stalled
 * could hang the classifier well past the ceiling.
 */
async function requestWithinDeadline(
  url: string,
  init: RequestInit,
  deadline: Deadline,
  stage: string,
): Promise<Leg> {
  const budget = deadline.remaining();
  if (budget <= 0) {
    throw new InferenceDeadlineError(stage);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const disarm = () => clearTimeout(timer);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal as any });
    return { response, disarm };
  } catch (error) {
    disarm();
    throw error;
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

/** Provider bodies are sometimes prefixed with SSE keep-alive comments. */
function stripKeepAlives(text: string): string {
  return text.replace(/^(\s*:\s*keep-alive\n)+|^\n+/, "").trim();
}

export class AIClient {
  private anthropicEndpoint = "https://api.anthropic.com/v1/messages";

  constructor(private options: AIClientOptions) {}

  public async generate(messages: AIMessage[], stream: boolean = false) {
    const startedAt = Date.now();
    const deadline = createDeadline(resolveTimeout(this.options.timeoutMs));
    // Reserve part of the ceiling for failover so a hung primary cannot
    // monopolise it.
    const primaryBudget = Math.max(
      1,
      Math.floor((deadline.at - startedAt) * PRIMARY_LEG_BUDGET_SHARE),
    );
    const primaryDeadline = createDeadline(primaryBudget);

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

    try {
      const leg = await requestWithinDeadline(
        deepseekEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.apiKey || process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify(payload),
        },
        primaryDeadline,
        "primary",
      );

      const { response } = leg;

      try {
        if ([429, 500, 503].includes(response.status)) {
          throw new Error(`Recoverable error: ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`Unrecoverable error: ${response.status}`);
        }

        if (stream) {
          // The consumer drains this body; our timer must not fire under it.
          return {
            response,
            provider: "deepseek",
            ttft: Date.now() - startedAt,
            deadlineMs: AI_TIMEOUT_CEILING_MS,
            elapsedMs: Date.now() - startedAt,
          };
        }

        // Body read stays inside the deadline.
        const text = stripKeepAlives(await response.text());
        const json = JSON.parse(text);
        this.options.onTelemetry?.(json.usage, "deepseek", Date.now() - startedAt, false);
        return {
          response: new Response(JSON.stringify(json), { headers: response.headers }),
          provider: "deepseek",
          ttft: Date.now() - startedAt,
          deadlineMs: AI_TIMEOUT_CEILING_MS,
          elapsedMs: Date.now() - startedAt,
        };
      } finally {
        leg.disarm();
      }
    } catch (e: any) {
      const message: string = e?.message || String(e);
      const isRecoverable =
        message.includes("Recoverable error") ||
        message.includes("fetch failed") ||
        message.includes("timeout") ||
        message.includes("deadline exceeded") ||
        e?.name === "TypeError" ||
        e?.name === "AbortError";

      if (!isRecoverable) {
        this.options.onError?.(message);
        return this.degrade(message, stream, startedAt);
      }

      // DeepSeek unavailable or over budget — fail over to Anthropic with
      // whatever is left of the shared ceiling.
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
        const leg = await requestWithinDeadline(
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
          deadline,
          "failover",
        );

        const { response } = leg;

        try {
          if (!response.ok) {
            throw new Error(`Fallback failed: ${response.status}`);
          }

          if (stream) {
            return {
              response,
              provider: "anthropic",
              ttft: Date.now() - fallbackStartTime,
              deadlineMs: AI_TIMEOUT_CEILING_MS,
              elapsedMs: Date.now() - startedAt,
            };
          }

          const text = stripKeepAlives(await response.text());
          const json = JSON.parse(text);
          this.options.onTelemetry?.(json.usage, "anthropic", Date.now() - fallbackStartTime, true);
          return {
            response: new Response(JSON.stringify(json), { headers: response.headers }),
            provider: "anthropic",
            ttft: Date.now() - fallbackStartTime,
            deadlineMs: AI_TIMEOUT_CEILING_MS,
            elapsedMs: Date.now() - startedAt,
          };
        } finally {
          leg.disarm();
        }
      } catch (fallbackError: any) {
        const fallbackMessage: string = fallbackError?.message || String(fallbackError);
        console.warn(`Fallback also failed: ${fallbackMessage}`);
        this.options.onError?.(fallbackMessage);
        return this.degrade(fallbackMessage, stream, startedAt);
      }
    }
  }

  /** Deterministic, non-hanging verdict used whenever both legs fail. */
  private degrade(reason: string, stream: boolean, startedAt: number) {
    return {
      response: fallbackResponse(reason, stream),
      provider: FALLBACK_PROVIDER,
      ttft: Date.now() - startedAt,
      deadlineMs: AI_TIMEOUT_CEILING_MS,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
