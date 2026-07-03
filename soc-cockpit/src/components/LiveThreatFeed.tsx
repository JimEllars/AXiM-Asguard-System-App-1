"use client";

import React, { useEffect, useState } from 'react';
import { z } from 'zod';

const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(),
  timestamp: z.number(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  details: z.record(z.unknown()).optional(),
});
type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

export default function LiveThreatFeed() {
  const [data, setData] = useState<TelemetryPayload[]>([]);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchTelemetry = async () => {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      if (!workerUrl) {
        setError("NEXT_PUBLIC_INTERCEPTOR_URL is not set.");
        setIsLoading(false);
        return;
      }
      if (!apiKey) {
        setError("NEXT_PUBLIC_ASGUARD_API_KEY is not set.");
        setIsLoading(false);
        return;
      }

      try {
        const [telemetryRes, blocklistRes] = await Promise.all([
          fetch(`${workerUrl}/telemetry`, {
            headers: { 'X-Asguard-Auth': apiKey },
          }),
          fetch(`${workerUrl}/blocklist`, {
            headers: { 'X-Asguard-Auth': apiKey },
          })
        ]);

        if (!telemetryRes.ok) {
          throw new Error(`Failed to fetch telemetry: ${telemetryRes.statusText}`);
        }
        if (!blocklistRes.ok) {
          throw new Error(`Failed to fetch blocklist: ${blocklistRes.statusText}`);
        }

        const jsonTelemetryData = await telemetryRes.json();
        const jsonBlocklistData = await blocklistRes.json();

        const parsedData = z.array(TelemetryPayloadSchema).parse(jsonTelemetryData);
        const parsedBlocklist = z.array(z.string()).parse(jsonBlocklistData);

        setData(parsedData);
        setBlocklist(parsedBlocklist);
        setLastSynced(new Date());
        setError(null);

        setFlash(true);
        setTimeout(() => setFlash(false), 500);

      } catch (err: unknown) {
        console.error("Error fetching data:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(String(err));
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: TelemetryPayload['severity']) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-950/50 border-red-900';
      case 'high': return 'text-orange-400 bg-orange-950/50 border-orange-900';
      case 'medium': return 'text-yellow-400 bg-yellow-950/50 border-yellow-900';
      case 'low': return 'text-blue-400 bg-blue-950/50 border-blue-900';
      default: return 'text-slate-400 bg-slate-900/50 border-slate-800';
    }
  };

  const getEventName = (eventType: TelemetryPayload['eventType']) => {
    switch (eventType) {
      case 'authentication_failure': return 'Auth Failure';
      case 'signature_tampering': return 'Sig Tamper';
      case 'suspicious_activity': return 'Suspicious';
      default: return eventType;
    }
  }

  const renderTelemetrySkeleton = () => (
    Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse">
        <div className="h-4 bg-slate-800 rounded"></div>
        <div className="h-4 bg-slate-800 rounded"></div>
        <div className="h-4 bg-slate-800 rounded"></div>
        <div className="h-4 bg-slate-800 rounded"></div>
      </div>
    ))
  );

  const renderBlocklistSkeleton = () => (
    Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-3/4"></div>
      </div>
    ))
  );


  const handleDropIp = async (ip: string) => {
    setActionLoading(prev => ({ ...prev, [ip]: true }));
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

    if (!workerUrl || !apiKey) {
      console.error("Missing credentials for action");
      setActionLoading(prev => ({ ...prev, [ip]: false }));
      return;
    }

    try {
      const res = await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: `ip:${ip}`, action: 'block' })
      });

      if (!res.ok) {
        throw new Error('Failed to drop IP');
      }

      // Optimistically update the blocklist
      setBlocklist(prev => {
        const key = `ip:${ip}`;
        return prev.includes(key) ? prev : [...prev, key];
      });

    } catch (err) {
      console.error("Error dropping IP:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [ip]: false }));
    }
  };

  const filteredData = React.useMemo(() => {
    return data.filter(event => {
      // 1. Filter by severity
      let matchesSeverity = true;
      if (severityFilter === 'high') {
        matchesSeverity = event.severity === 'high' || event.severity === 'critical';
      } else if (severityFilter !== 'all') {
        matchesSeverity = event.severity === severityFilter;
      }

      // 2. Filter by search query
      let matchesSearch = true;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        matchesSearch =
          event.sourceIp.toLowerCase().includes(query) ||
          getEventName(event.eventType).toLowerCase().includes(query) ||
          JSON.stringify(event.details || {}).toLowerCase().includes(query);
      }

      return matchesSeverity && matchesSearch;
    });
  }, [data, severityFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-4 h-full flex-1 min-h-0">

      {/* Synchronization Clock */}
      <div className="flex justify-end">
        <div className={`text-xs font-mono border px-3 py-1.5 rounded transition-colors duration-300 ${flash ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
          SYNC INTERVAL: 5000MS | LAST INDEXED: {lastSynced ? lastSynced.toLocaleTimeString('en-GB') : '--:--:--'}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Ingested Alerts</div>
          <div className="text-2xl font-mono text-slate-200">{isLoading ? '-' : data.length}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Active Edge Drops</div>
          <div className="text-2xl font-mono text-slate-200">{isLoading ? '-' : blocklist.length}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Node Latency Target</div>
          <div>
             <span className="text-xl font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-2 py-1 rounded">
               &lt; 5ms
             </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex gap-4 items-center">
        <input
          type="text"
          placeholder="Search by IP or Signature..."
          className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 w-64 focus:outline-none focus:border-slate-500 font-mono"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500 uppercase tracking-wider font-semibold"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
        >
          <option value="all">Severity: ALL</option>
          <option value="high">Severity: HIGH / CRITICAL</option>
          <option value="medium">Severity: MEDIUM</option>
          <option value="low">Severity: LOW</option>
        </select>
      </div>

      {/* Main Content Area */}
      {error ? (
        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center p-8">
           <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-6 max-w-lg w-full animate-pulse shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-2 h-2 rounded-full bg-red-500"></div>
                 <h3 className="text-red-400 font-mono text-sm font-bold uppercase">Connection Failure</h3>
              </div>
              <div className="text-slate-400 font-mono text-sm break-all">
                {error}
              </div>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

          {/* Left Pane: Telemetry Grid (2/3) */}
          <div className="flex-[2] bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-0">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0 flex justify-between items-center">
              <div className="grid grid-cols-5 gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-full">
                 <div>Timestamp</div>
                 <div>Source IP</div>
                 <div>Event Type</div>
                 <div>Severity</div>
                 <div>Action</div>
              </div>
            </div>

            <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
               {isLoading ? (
                  renderTelemetrySkeleton()
               ) : filteredData.length === 0 ? (
                  <div className="text-center p-8 text-slate-500 font-mono text-sm">No telemetry events logged yet.</div>
               ) : (
                 filteredData.map((event, idx) => {
                   const isHighSeverity = event.severity === 'high' || event.severity === 'critical';
                   const isBlocked = blocklist.includes(`ip:${event.sourceIp}`);
                   return (
                     <div key={idx} className="grid grid-cols-5 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                       <div className="text-slate-500">
                          {new Date(event.timestamp).toLocaleTimeString('en-GB')}
                       </div>
                       <div className="text-slate-300 truncate">
                          {event.sourceIp}
                       </div>
                       <div className="truncate">
                          {getEventName(event.eventType)}
                       </div>
                       <div>
                          <span className={`px-2 py-1 rounded text-xs border whitespace-nowrap ${getSeverityColor(event.severity)}`}>
                            {event.severity.toUpperCase()}
                          </span>
                       </div>
                       <div>
                          {isHighSeverity && !isBlocked && (
                            <button
                              onClick={() => handleDropIp(event.sourceIp)}
                              disabled={actionLoading[event.sourceIp]}
                              className="bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-700 px-2 py-1 rounded text-xs transition-colors disabled:opacity-50"
                            >
                              {actionLoading[event.sourceIp] ? 'Dropping...' : 'Drop IP'}
                            </button>
                          )}
                          {isBlocked && (
                            <span className="text-xs text-slate-500 italic">Dropped</span>
                          )}
                       </div>
                     </div>
                   );
                 })
               )}
            </div>
          </div>

          {/* Right Pane: Active Perimeter Blocks (1/3) */}
          <div className="flex-[1] bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-0">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                 Active Perimeter Blocks
              </div>
            </div>

            <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
               {isLoading ? (
                  renderBlocklistSkeleton()
               ) : blocklist.length === 0 ? (
                  <div className="text-center p-8 text-slate-500 font-mono text-sm">No active blocks.</div>
               ) : (
                 blocklist.map((keyName, idx) => (
                   <div key={idx} className="p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono truncate">
                     {keyName}
                   </div>
                 ))
               )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
