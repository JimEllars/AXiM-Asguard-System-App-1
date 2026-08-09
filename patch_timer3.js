const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const globalThreatStateSearch = `  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'unknown'>('unknown');`;
const globalThreatStateReplace = `  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'unknown'>('unknown');
  const [globalThreatLevel, setGlobalThreatLevel] = useState<string>('LOW');`;
code = code.replace(globalThreatStateSearch, globalThreatStateReplace);

const updateGlobalThreatSearch1 = `          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');`;
const updateGlobalThreatReplace1 = `          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
          if (healthData.globalThreatLevel) setGlobalThreatLevel(healthData.globalThreatLevel);`;
code = code.split(updateGlobalThreatSearch1).join(updateGlobalThreatReplace1);

const threatBadgeSearch = `        <div className={\`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 \${
          healthStatus === 'ok'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : healthStatus === 'degraded'
            ? 'bg-amber-950/80 border-amber-500 text-amber-300'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }\`}>
          {healthStatus === 'ok' ? 'STATUS: PERIMETER SECURE' : healthStatus === 'degraded' ? 'STATUS: PERIMETER DEGRADED' : 'STATUS: UNKNOWN'}
          <span className={\`h-2 w-2 rounded-full \${healthStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : healthStatus === 'degraded' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}\`}></span>
        </div>`;

const threatBadgeReplace = `        <div className={\`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 \${
          healthStatus === 'ok'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : healthStatus === 'degraded'
            ? 'bg-amber-950/80 border-amber-500 text-amber-300'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }\`}>
          {healthStatus === 'ok' ? 'STATUS: PERIMETER SECURE' : healthStatus === 'degraded' ? 'STATUS: PERIMETER DEGRADED' : 'STATUS: UNKNOWN'}
          <span className={\`h-2 w-2 rounded-full \${healthStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : healthStatus === 'degraded' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}\`}></span>
        </div>

        {/* Global Threat Level Badge */}
        <div className={\`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 \${
            globalThreatLevel === 'CRITICAL' ? 'bg-red-950/80 border-red-500 text-red-300' :
            globalThreatLevel === 'HIGH' ? 'bg-amber-950/80 border-amber-500 text-amber-300' :
            globalThreatLevel === 'ELEVATED' ? 'bg-yellow-950/80 border-yellow-500 text-yellow-300' :
            'bg-emerald-950/80 border-emerald-500 text-emerald-300'
        }\`}>
           <span>THREAT LEVEL: {globalThreatLevel}</span>
           <span className={\`h-2 w-2 rounded-full \${
               globalThreatLevel === 'CRITICAL' ? 'bg-red-500 animate-pulse' :
               globalThreatLevel === 'HIGH' ? 'bg-amber-500' :
               globalThreatLevel === 'ELEVATED' ? 'bg-yellow-500' :
               'bg-emerald-500'
           }\`}></span>
        </div>`;

code = code.split(threatBadgeSearch).join(threatBadgeReplace);

fs.writeFileSync(file, code);
