const fs = require('fs');

// In asguard-interceptor/src/index.ts:
// `const twentyFourHoursAgo = now - 86400 * 1000;`
// In test: `const now = Date.now(); timestamp: now - 1000` (which is > twentyFourHoursAgo, so it should be included).
// But maybe `recent_events` is parsed using `JSON.parse`?
// In index.ts:
// `const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];`
// Wait, in index.ts:
// `const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];`
// `const recentEvents = Array.isArray(recentEventsStr) ? recentEventsStr : [];`
// BUT in the test:
// `if (key === "recent_events") return JSON.stringify(Array(5).fill({ aiThreatFlag: true, timestamp: now - 1000 }));`
// If it asks for `{ type: "json" }`, the mock might just return the string instead of parsing it if we just mock `get` to return a string.
// Wait! The mock of `mockTelemetryKV.get` is:
// `mockTelemetryKV.get.mockImplementation(async (key) => { ... })`
// It doesn't handle the options argument in the mock for JSON parsing. If the worker expects it to be already parsed when `{ type: "json" }` is passed.

let path = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /if \(key === "recent_events"\) \{\s*return JSON\.stringify\(Array\(5\)\.fill\(\{ aiThreatFlag: true, timestamp: now - 1000 \}\)\);\s*\}/,
    `if (key === "recent_events") {
             const val = Array(5).fill({ aiThreatFlag: true, timestamp: now - 1000 });
             // Check if options have { type: 'json' } in the test, but since we mock \`get\`,
             // in some other tests it returns string, we will just return array directly if the second arg is { type: "json" }
             // We can't access the second arg easily if we just mocked the first, but let's change mockImplementation.
         }`
);

// Actually, I can just change the mock
code = code.replace(
    /mockTelemetryKV\.get\.mockImplementation\(async \(key\) => \{/,
    `mockTelemetryKV.get.mockImplementation(async (key, options) => {`
);

code = code.replace(
    /if \(key === "recent_events"\) \{\s*const val = .*?\s*\}\s*/,
    `if (key === "recent_events") {
             const arr = Array(5).fill({ aiThreatFlag: true, timestamp: now - 1000 });
             return options && options.type === "json" ? arr : JSON.stringify(arr);
         }`
);

// Wait, the regex I replaced was removed partially. Let me do it cleanly.
fs.writeFileSync(path, code);
