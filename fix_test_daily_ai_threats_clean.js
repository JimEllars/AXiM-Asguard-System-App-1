const fs = require('fs');
let path = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/mockTelemetryKV\.get\.mockImplementation\(async \(key\) => \{[\s\S]*?if \(key === "recent_events"\) \{[\s\S]*?\}[\s\S]*?return null;\s*\}\);/,
`mockTelemetryKV.get.mockImplementation(async (key, options) => {
         if (key === "dlq:123") return JSON.stringify({ timestamp: now - 31 * 86400 * 1000 });
         if (key === "recent_events") {
             const arr = Array(5).fill({ aiThreatFlag: true, timestamp: now - 1000 });
             return options && options.type === "json" ? arr : JSON.stringify(arr);
         }
         return null;
      });`);

fs.writeFileSync(path, code);
