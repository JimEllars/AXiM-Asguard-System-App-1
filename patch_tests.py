import re

with open('asguard-interceptor/tests/interceptor.test.ts', 'r') as f:
    content = f.read()

new_test = """
  it("rejects autonomous block if key targets protected internal namespace", async () => {
    const protectedKeys = ["token:axim_core_secret", "ip:10.0.0.1", "ip:127.0.0.1", "ip:192.168.1.1"];

    for (const key of protectedKeys) {
      const request = new Request("http://localhost/blocklist/autonomous", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-ai-mutation-key",
        },
        body: JSON.stringify({
          key,
          ttl: 3600
        }),
      });
      const ctx = { waitUntil: vi.fn() } as any;
      const response = await worker.fetch(request, env as any, ctx);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("protected internal target");
    }
  });
"""

content = content.replace('it("rejects autonomous block with invalid token", async () => {', new_test + '\n  it("rejects autonomous block with invalid token", async () => {')

with open('asguard-interceptor/tests/interceptor.test.ts', 'w') as f:
    f.write(content)
