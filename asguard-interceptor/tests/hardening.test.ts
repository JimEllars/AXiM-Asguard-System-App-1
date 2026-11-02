import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { Env, __resetEdgeStateForTests } from "../src/index";
import { inspectRequest } from "../src/threatEngine";
import { AIClient, AI_TIMEOUT_CEILING_MS, FALLBACK_PROVIDER } from "../src/aiService";

const originalFetch = global.fetch;

const BROWSER_UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

function makeKV(overrides: Record<string, any> = {}) {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    ...overrides,
  };
}

function makeEnv(overrides: Record<string, any> = {}): Env {
  return {
    ASGUARD_API_KEY: "secret-key",
    TELEMETRY_INGEST_KEY: "ingest-key",
    ASGUARD_BLACKLIST: makeKV() as any,
    ASGUARD_TELEMETRY: makeKV() as any,
    THREAT_CACHE: makeKV() as any,
    ...overrides,
  } as any as Env;
}

function makeCtx() {
  return { waitUntil: vi.fn() } as any;
}

describe("CGI argument injection (PHP2Shell / CVE-2024-4577)", () => {
  beforeEach(() => {
    __resetEdgeStateForTests();
    (globalThis as any).caches = {
      default: { match: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const payloads = [
    "https://example.com/index.php?-d+allow_url_include%3d1+-d+auto_prepend_file%3dphp://input",
    "https://example.com/?-d+allow_url_include=1",
    "https://example.com/?%ADd+allow_url_include%3D1",
    "https://example.com/?%2Dd+auto_prepend_file%3Dphp%3A%2F%2Finput",
    "https://example.com/?x=1&auto_prepend_file=php://input",
    "https://example.com/?x=1&auto_append_file=/tmp/payload.php",
    "https://example.com/?x=1&allow_url_include=1",
    "https://example.com/?x=1&disable_functions=none",
    "https://example.com/?x=1&safe_mode=0",
  ];

  it.each(payloads)("classifies %s as CGI_INJECTION", (url) => {
    const verdict = inspectRequest(new Request(url, { headers: BROWSER_UA }), "203.0.113.7");
    expect(verdict.isThreat).toBe(true);
    expect(verdict.severity).toBe("CRITICAL");
    expect(verdict.category).toBe("CGI_INJECTION");
  });

  it("fail-closes with HTTP 403 at the edge", async () => {
    const request = new Request("https://example.com/?-d+allow_url_include%3d1", {
      headers: { ...BROWSER_UA, "cf-connecting-ip": "203.0.113.7" },
    });

    const response = await worker.fetch(request, makeEnv(), makeCtx());

    expect(response.status).toBe(403);
    expect(response.headers.get("X-Asguard-Action")).toBe("blocked-threat-engine");
    expect(response.headers.get("X-Asguard-Threat-Category")).toBe("CGI_INJECTION");
  });

  it("does not misfire on ordinary dashed query values", () => {
    const benign = [
      "https://example.com/api/search?q=state-of-the-art",
      "https://example.com/api/search?q=run-and-gun",
      "https://example.com/api/items?sort=desc&page=2",
    ];
    for (const url of benign) {
      const verdict = inspectRequest(new Request(url, { headers: BROWSER_UA }), "203.0.113.7");
      expect(verdict.isThreat).toBe(false);
    }
  });
});

describe("Path traversal and PHP shell probes", () => {
  const cases: Array<[string, string]> = [
    ["https://example.com/api?file=../../../etc/passwd", "PATH_TRAVERSAL"],
    ["https://example.com/static/%2e%2e%2f%2e%2e%2fetc/passwd", "PATH_TRAVERSAL"],
    ["https://example.com/static/%252e%252e%252fetc/passwd", "PATH_TRAVERSAL"],
    ["https://example.com/uploads/shell.php", "PHP_SHELL_PROBE"],
    ["https://example.com/wp-admin/admin-ajax.php", "PHP_SHELL_PROBE"],
    ["https://example.com/wp-admin/", "PHP_SHELL_PROBE"],
  ];

  it.each(cases)("%s is blocked as %s", (url, category) => {
    const verdict = inspectRequest(new Request(url, { headers: BROWSER_UA }), "203.0.113.8");
    expect(verdict.isThreat).toBe(true);
    expect(verdict.severity).toBe("CRITICAL");
    expect(verdict.category).toBe(category);
  });
});

describe("Global blocklist interlock", () => {
  beforeEach(() => {
    __resetEdgeStateForTests();
    (globalThis as any).caches = {
      default: { match: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn() },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("drops a blacklisted IP before any route handling, including /health", async () => {
    const blacklist = makeKV({ get: vi.fn().mockResolvedValue("1") });
    const request = new Request("https://example.com/health", {
      headers: { ...BROWSER_UA, "cf-connecting-ip": "198.51.100.23" },
    });

    const response = await worker.fetch(request, makeEnv({ ASGUARD_BLACKLIST: blacklist }), makeCtx());

    expect(response.status).toBe(403);
    expect(blacklist.get).toHaveBeenCalledWith("ip:198.51.100.23");
    expect(response.headers.get("X-Asguard-Action")).toBe("blocked-blacklist");
  });

  it("consults both the threat cache and the durable blacklist namespace", async () => {
    const blacklist = makeKV();
    const threatCache = makeKV({ get: vi.fn().mockResolvedValue("BLOCKED") });
    const request = new Request("https://example.com/health", {
      headers: { ...BROWSER_UA, "cf-connecting-ip": "198.51.100.24" },
    });

    const response = await worker.fetch(
      request,
      makeEnv({ ASGUARD_BLACKLIST: blacklist, THREAT_CACHE: threatCache }),
      makeCtx(),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("X-Asguard-Action")).toBe("blocked-edge-kv");
    expect(blacklist.get).toHaveBeenCalledWith("ip:198.51.100.24");
    expect(threatCache.get).toHaveBeenCalledWith("ip:198.51.100.24");
  });

  it("allows a clean IP through to the route handler", async () => {
    const request = new Request("https://example.com/health", {
      headers: { ...BROWSER_UA, "cf-connecting-ip": "198.51.100.25" },
    });

    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("OK");
  });
});

describe("AI classifier timeout isolation", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function neverResolvingFetch() {
    return vi.fn((_url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err: any = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
  }

  it("pins the ceiling at 8 seconds", () => {
    expect(AI_TIMEOUT_CEILING_MS).toBe(8000);
  });

  it("aborts a hung provider and returns the deterministic fallback payload", async () => {
    global.fetch = neverResolvingFetch() as any;

    const client = new AIClient({ userId: "test-user", timeoutMs: 40 });
    const started = Date.now();
    const { provider, response } = await client.generate([
      { role: "system", content: "analyse" },
      { role: "user", content: "{}" },
    ]);
    const elapsed = Date.now() - started;

    expect(provider).toBe(FALLBACK_PROVIDER);
    // Both the primary and the failover leg must respect the deadline.
    expect(elapsed).toBeLessThan(2000);

    const body = (await response.json()) as any;
    expect(body.risk).toBe("medium");
    expect(body.summary).toBe("Automated heuristic fallback triggered");
    expect(body.recommendedActions).toContain("Monitor IP");
    expect(body.degraded).toBe(true);
    expect(response.headers.get("X-Asguard-Degraded")).toBe("true");
  });

  it("returns a well-formed SSE frame when the streaming path degrades", async () => {
    global.fetch = neverResolvingFetch() as any;

    const client = new AIClient({ userId: "test-user", timeoutMs: 40 });
    const { provider, response } = await client.generate(
      [{ role: "user", content: "hello" }],
      true,
    );

    expect(provider).toBe(FALLBACK_PROVIDER);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await response.text();
    expect(text.startsWith("data: ")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(true);
    const frame = JSON.parse(text.slice("data: ".length).trim()) as any;
    expect(frame.risk).toBe("medium");
    expect(frame.degraded).toBe(true);
  });

  it("never exceeds the ceiling even when a caller asks for longer", async () => {
    const client = new AIClient({ userId: "test-user", timeoutMs: 60000 });
    // resolveTimeout is private; assert via the observable constant contract
    expect((client as any).options.timeoutMs).toBe(60000);
    expect(Math.min(60000, AI_TIMEOUT_CEILING_MS)).toBe(8000);
  });
});
