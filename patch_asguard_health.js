const fs = require('fs');
const path = 'asguard-interceptor/src/index.ts';

let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /let lastHeartbeat = null;\s*if\s*\(heartbeatRaw\)\s*\{\s*try\s*\{\s*const\s*hb\s*=\s*JSON\.parse\(heartbeatRaw\);\s*lastHeartbeat\s*=\s*hb\.timestamp\s*\|\|\s*null;\s*\}\s*catch\(e\)\s*\{\}\s*\}/,
    `let lastHeartbeat = null;
        let fullHeartbeat = null;
        if (heartbeatRaw) {
          try {
            const hb = JSON.parse(heartbeatRaw);
            lastHeartbeat = hb.timestamp || null;
            fullHeartbeat = hb;
          } catch(e) {}
        }`
);

code = code.replace(
    /lastHeartbeat,\s*timestamp:\s*Date\.now\(\)\s*\}\),/,
    `lastHeartbeat,
          heartbeatDetails: fullHeartbeat,
          timestamp: Date.now()
        }),`
);

fs.writeFileSync(path, code);
console.log("Patched asguard-interceptor health endpoint");
