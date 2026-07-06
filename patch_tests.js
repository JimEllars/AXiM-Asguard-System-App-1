const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'asguard-interceptor/tests/interceptor.test.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const newTest = `
  it("escalates ip to blocklist on frequent requests", async () => {
    const request = new Request("https://example.com/telemetry", {
      method: "OPTIONS",
      headers: { "cf-connecting-ip": "9.9.9.9" },
    });

    mockTelemetryKV.get.mockImplementation(async (key) => {
       if (key === "rate_limit:9.9.9.9") return "101";
       if (key === "429_exceptions:9.9.9.9") return "4";
       return null;
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      ASGUARD_GLOBAL_BLOCKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    // Since it's options, the original code will bypass the logic if OPTIONS. Let's send a GET.
    // wait, I put the logic BEFORE OPTIONS. Let me check the code.
  });
`;
// content = content.replace("describe(\"Asguard Interceptor\", () => {", "describe(\"Asguard Interceptor\", () => {\n" + newTest);
// fs.writeFileSync(filePath, content);
