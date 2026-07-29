const fs = require('fs');
const path = 'soc-cockpit/src/components/LiveThreatFeed.tsx';

let code = fs.readFileSync(path, 'utf8');

// Add states
code = code.replace(
    /const \[lastHeartbeat,\s*setLastHeartbeat\]\s*=\s*useState<number\s*\|\s*null>\(null\);/,
    `const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [heartbeatDetails, setHeartbeatDetails] = useState<Record<string, unknown> | null>(null);
  const [showCronPopover, setShowCronPopover] = useState(false);`
);

// Update initial health fetch (fetchData inside useEffect)
code = code.replace(
    /const healthData = await healthRes\.json\(\);\s*setEdgeMetrics\(\{\s*rateLimitSize:\s*healthData\.rateLimitSize\s*\|\|\s*0,\s*penaltyLedgerSize:\s*healthData\.penaltyLedgerSize\s*\|\|\s*0\s*\}\);\s*setHealthStatus\(healthData\.status\s*===\s*'ok'\s*&&\s*healthData\.blacklist\s*===\s*'ok'\s*&&\s*healthData\.telemetry\s*===\s*'ok'\s*\?\s*'ok'\s*:\s*'degraded'\);\s*if\s*\(healthData\.lastHeartbeat\)\s*setLastHeartbeat\(healthData\.lastHeartbeat\);/g,
    `const healthData = await healthRes.json();
          setEdgeMetrics({ rateLimitSize: healthData.rateLimitSize || 0, penaltyLedgerSize: healthData.penaltyLedgerSize || 0 });
          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
          if (healthData.lastHeartbeat) setLastHeartbeat(healthData.lastHeartbeat);
          if (healthData.heartbeatDetails) setHeartbeatDetails(healthData.heartbeatDetails);`
);

// We need to match this replacement globally or target all instances since there's multiple health fetches
code = code.replace(
    /const healthData = await healthRes\.json\(\);\s*setEdgeMetrics\(\{\s*rateLimitSize:\s*healthData\.rateLimitSize\s*\|\|\s*0,\s*penaltyLedgerSize:\s*healthData\.penaltyLedgerSize\s*\|\|\s*0\s*\}\);\s*setHealthStatus\(healthData\.status\s*===\s*'ok'\s*&&\s*healthData\.blacklist\s*===\s*'ok'\s*&&\s*healthData\.telemetry\s*===\s*'ok'\s*\?\s*'ok'\s*:\s*'degraded'\);/g,
    `const healthData = await healthRes.json();
          setEdgeMetrics({ rateLimitSize: healthData.rateLimitSize || 0, penaltyLedgerSize: healthData.penaltyLedgerSize || 0 });
          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
          if (healthData.lastHeartbeat) setLastHeartbeat(healthData.lastHeartbeat);
          if (healthData.heartbeatDetails) setHeartbeatDetails(healthData.heartbeatDetails);`
);


// Replace the CRON AUTOMATION badge
const badgeRegex = /<div className="text-xs bg-emerald-950\/50 border border-emerald-900 px-3 py-1\.5 rounded-md text-emerald-400 font-mono flex items-center gap-2 w-max">[\s\S]*?CRON AUTOMATION: ACTIVE \[ DAILY SCHEDULED \][\s\S]*?<\/div>/;

const replacementBadge = `<div className="relative">
          <div
            onClick={() => setShowCronPopover(prev => !prev)}
            className="cursor-pointer hover:bg-emerald-900/50 transition-colors text-xs bg-emerald-950/50 border border-emerald-900 px-3 py-1.5 rounded-md text-emerald-400 font-mono flex items-center gap-2 w-max"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            CRON AUTOMATION: ACTIVE [ HOURLY / DAILY ]
          </div>
          {showCronPopover && (
            <div className="absolute top-full left-0 mt-2 w-max min-w-[300px] z-50 bg-slate-900/95 border border-slate-700 rounded shadow-xl p-4 font-mono text-xs">
               <div className="text-slate-300 font-bold mb-3 uppercase tracking-wider border-b border-slate-700 pb-2 flex justify-between">
                 <span>[ Cron Heartbeat Telemetry ]</span>
                 <button onClick={() => setShowCronPopover(false)} className="text-slate-500 hover:text-slate-300">X</button>
               </div>
               {heartbeatDetails ? (
                  <div className="space-y-2 text-slate-400">
                     <div className="flex justify-between">
                        <span>STATUS:</span>
                        <span className={heartbeatDetails.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
                           {heartbeatDetails.status === 'ok' ? 'OK' : 'DEGRADED'}
                        </span>
                     </div>
                     <div className="flex justify-between">
                        <span>LAST HEARTBEAT:</span>
                        <span className="text-slate-200">
                           {heartbeatDetails.timestamp ? new Date(heartbeatDetails.timestamp as number).toLocaleString('en-GB') : 'UNKNOWN'}
                        </span>
                     </div>
                     <div className="flex justify-between">
                        <span>EXPIRED KEYS PURGED:</span>
                        <span className="text-slate-200">{String(heartbeatDetails.expiredKeysPurged ?? 0)}</span>
                     </div>
                     <div className="flex justify-between">
                        <span>BUFFER FLUSHED:</span>
                        <span className="text-slate-200">{String(heartbeatDetails.bufferFlushedCount ?? 0)}</span>
                     </div>
                     <div className="flex justify-between">
                        <span>AI THREATS (24H):</span>
                        <span className="text-slate-200">{String(heartbeatDetails.aiThreatCount24h ?? 0)}</span>
                     </div>
                     <div className="flex justify-between">
                        <span>CRON SCHEDULE:</span>
                        <span className="text-slate-200">{String(heartbeatDetails.cronSchedule ?? 'UNKNOWN')}</span>
                     </div>
                  </div>
               ) : (
                  <div className="text-slate-500 text-center py-2">
                     Awaiting heartbeat sync...
                  </div>
               )}
            </div>
          )}
        </div>`;

code = code.replace(badgeRegex, replacementBadge);

fs.writeFileSync(path, code);
console.log("Patched LiveThreatFeed.tsx");
