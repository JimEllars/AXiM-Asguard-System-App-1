const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

// The new requirement is: In the top header status control bar, render a global threat level badge driven by healthData.globalThreatLevel:
// CRITICAL (pulsating red), HIGH (amber), ELEVATED (yellow), LOW (emerald).
// The health status div is currently:
const searchHealthStatus = `
        <div className={\`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 \${
          healthStatus === 'ok'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : healthStatus === 'degraded'
            ? 'bg-amber-950/80 border-amber-500 text-amber-300'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }\`}>
          {healthStatus === 'ok' ? 'STATUS: PERIMETER SECURE' : healthStatus === 'degraded' ? 'STATUS: PERIMETER DEGRADED' : 'STATUS: UNKNOWN'}
          <span className={\`h-2 w-2 rounded-full \${healthStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : healthStatus === 'degraded' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}\`}></span>
        </div>
`;

// Let's make sure we have access to `healthData.globalThreatLevel`. Where is `healthData` stored? `fetchHealth`?
const fetchHealthSearch = `
      try {
        const res = await fetch(\`\${workerUrl}/health\`, {
          headers: { 'X-Asguard-Auth': apiKey }
        });
        if (res.ok) {
          const body = await res.json();
`;
