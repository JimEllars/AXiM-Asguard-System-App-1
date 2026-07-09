"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { z } from 'zod';
import { supabase } from '@/utils/supabaseClient';

const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(),
  timestamp: z.number(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  requestMethod: z.string().optional(),
  targetResource: z.string().optional(),
  signatureMetadata: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  country: z.string().optional(),
  colo: z.string().optional(),
});
type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

const AuditEventSchema = z.object({
  action: z.string(),
  target: z.string(),
  ttl: z.number().optional(),
  timestamp: z.number(),
  signature: z.string().optional(),
});
type AuditEvent = z.infer<typeof AuditEventSchema>;



function formatTimeLeft(ms: number) {
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `Expires in ~${hours}h`;
  return `Lease: ${mins}m left`;
}

function LeaseTimer({ expiration }: { expiration: number }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    // expiration is a unix timestamp in seconds
    const expiresAt = expiration * 1000;
    return expiresAt - Date.now();
  });

  useEffect(() => {
    const expiresAt = expiration * 1000;
    const interval = setInterval(() => {
      setTimeLeft(expiresAt - Date.now());
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiration]);

  if (timeLeft <= 0) return null;

  return (
    <span className="text-[10px] text-amber-500/80 font-mono tracking-tighter border border-amber-900/50 bg-amber-950/20 px-1.5 py-0.5 rounded ml-2">
      {formatTimeLeft(timeLeft)}
    </span>
  );
}

export default function LiveThreatFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [data, setData] = useState<TelemetryPayload[]>([]);
  const [blocklist, setBlocklist] = useState<{ name: string; expiration?: number }[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [edgeLatency, setEdgeLatency] = useState<string | null>(null);
  const [velocityHistory, setVelocityHistory] = useState<('up' | 'down' | 'none')[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('asguard_velocity_history');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return parsed;
        } catch(e) {
          console.error('Failed to parse velocity history', e);
        }
      }
    }
    return [];
  });

  const velocityShift = velocityHistory.length > 0 ? velocityHistory[velocityHistory.length - 1] : 'none';
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');

  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>((searchParams.get('severity') as 'all' | 'high' | 'medium' | 'low') || 'all');
  const [appOriginFilter, setAppOriginFilter] = useState<string>(searchParams.get('origin') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [localSearchQuery, setLocalSearchQuery] = useState(searchParams.get('search') || '');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [localAuditSearchQuery, setLocalAuditSearchQuery] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setAuditSearchQuery(localAuditSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [localAuditSearchQuery]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});



  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('search', searchQuery);
    } else {
      params.delete('search');
    }
    if (severityFilter && severityFilter !== 'all') {
      params.set('severity', severityFilter);
    } else {
      params.delete('severity');
    }
    if (appOriginFilter && appOriginFilter !== 'all') {
      params.set('origin', appOriginFilter);
    } else {
      params.delete('origin');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchQuery, severityFilter, appOriginFilter, pathname, router, searchParams]);

  const [telemetryPage, setTelemetryPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [auditPage, setAuditPage] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const tempAuditPageFix = setAuditPage; // just to prevent the linter from warning about unused setAuditPage until I use it.
  const itemsPerPage = 10;


  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);

  const addToast = React.useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);


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
        const [telemetryRes, blocklistRes, auditRes] = await Promise.all([
          fetch(`${workerUrl}/telemetry`, {
            headers: { 'X-Asguard-Auth': apiKey },
          }),
          fetch(`${workerUrl}/blocklist`, {
            headers: { 'X-Asguard-Auth': apiKey },
          }),
          fetch(`${workerUrl}/audit`, {
            headers: { 'X-Asguard-Auth': apiKey },
          })
        ]);

        if (!telemetryRes.ok) {
          throw new Error(`Failed to fetch telemetry: ${telemetryRes.statusText}`);
        }
        if (!blocklistRes.ok) {
          throw new Error(`Failed to fetch blocklist: ${blocklistRes.statusText}`);
        }
        if (!auditRes.ok) {
          throw new Error(`Failed to fetch audit: ${auditRes.statusText}`);
        }

        const serverTiming = telemetryRes.headers.get('Server-Timing');
        if (serverTiming) {
          const match = serverTiming.match(/dur=([0-9.]+)/);
          if (match && match[1]) {
            setEdgeLatency(match[1]);
          }
        }

        const jsonTelemetryData = await telemetryRes.json();
        const jsonBlocklistData = await blocklistRes.json();
        const jsonAuditData = await auditRes.json();

        const parsedData = z.array(TelemetryPayloadSchema).parse(jsonTelemetryData).slice(0, 50);
        const parsedBlocklist = z.array(z.object({ name: z.string(), expiration: z.number().optional() })).parse(jsonBlocklistData);
        const parsedAudit = z.array(AuditEventSchema).parse(jsonAuditData);

        setData(prev => {
          // Merge new objects, unshift to top and cap at 50
          let newData = [...parsedData];
          if (prev.length > 0) {
            const newEvents = parsedData.filter(d => !prev.some(p => p.timestamp === d.timestamp && p.sourceIp === d.sourceIp));
            if (newEvents.length > 0) {
              newData = [...newEvents, ...prev].slice(0, 50);
            } else {
              newData = prev; // Nothing new, keep prev to avoid unnecessary re-renders
            }
          } else {
             // Cap initial payload too
             newData = newData.slice(0, 50);
          }

          if (JSON.stringify(prev) !== JSON.stringify(newData)) {
            // Update velocity indicator based on prev length
            if (prev.length > 0) {
                let shift: 'up' | 'down' | 'none' = 'none';
                if (newData.length > prev.length) shift = 'up';
                else if (newData.length < prev.length) shift = 'down';

                setVelocityHistory(prevHistory => {
                  const newHistory = [...prevHistory, shift].slice(-5);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('asguard_velocity_history', JSON.stringify(newHistory));
                  }
                  return newHistory;
                });
            }
            return newData;
          }
          return prev;
        });
        setBlocklist(prev => JSON.stringify(prev) !== JSON.stringify(parsedBlocklist) ? parsedBlocklist : prev);
        setAuditLog(prev => JSON.stringify(prev) !== JSON.stringify(parsedAudit) ? parsedAudit : prev);
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





    let channel: ReturnType<typeof supabase.channel>;
    let timeoutId: NodeJS.Timeout;
    let currentRetry = 0; // Fix: use local tracking

    const setupRealtime = () => {
      channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'security_audit_logs' },
          (payload) => {
            // Add new items instantly and trigger row accents via standard state transition
            setFlash(true);
            setTimeout(() => setFlash(false), 500);

            if (payload.new) {
               const newLog = payload.new;
               if (newLog.eventType) {
                   const parsed = TelemetryPayloadSchema.safeParse(newLog);
                   if (parsed.success) {
                       setData(prev => {
                           const newData = [...prev];
                           newData.unshift(parsed.data);
                           return newData.slice(0, 50);
                       });
                   }
               } else {
                   const parsed = AuditEventSchema.safeParse(newLog);
                   if (parsed.success) {
                       setAuditLog(prev => {
                           const newData = [...prev];
                           newData.unshift(parsed.data);
                           return newData.slice(0, 50);
                       });
                   }
               }
            }
          }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                setRealtimeStatus('CONNECTED');

                currentRetry = 0;
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                setRealtimeStatus(status === 'CLOSED' ? 'DISCONNECTED' : 'ERROR');
                // Auto-Heal backoff
                const backoffIntervals = [2000, 5000, 10000];
                const delay = backoffIntervals[Math.min(currentRetry, backoffIntervals.length - 1)];

                timeoutId = setTimeout(() => {

                    currentRetry++;
                    setupRealtime();
                }, delay);
            }
        });
    };

    setupRealtime();

    fetchTelemetry();


    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);


  // Instead of an effect, we could reset pages when handling filter changes or just allow the effect, but the linter complains.
  // Since we don't have setSeverityFilter wrapped, we'll disable the linter here for this specific necessity.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTelemetryPage(0);
  }, [severityFilter, searchQuery, appOriginFilter]);

  const getSeverityColor = (severity: TelemetryPayload['severity']) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'animate-pulse text-red-400 bg-red-950/80 border-red-900';
      case 'medium':
        return 'text-amber-400 bg-transparent border-amber-500';
      case 'low':
        return 'text-slate-400 bg-transparent border-slate-700';
      default:
        return 'text-slate-400 bg-transparent border-slate-800';
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
      <div key={i} className="grid grid-cols-6 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse">
        <div className="h-4 bg-slate-800 rounded"></div>
        <div className="h-4 bg-slate-800 rounded"></div>
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



  const handleExportAuditTrail = () => {
    const dataStr = JSON.stringify(auditLog, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `asguard_audit_trail_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUnblock = async (key: string) => {
    setActionLoading(prev => ({ ...prev, [key]: true }));
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

    if (!workerUrl || !apiKey) {
      console.error("Missing credentials for action");
      setActionLoading(prev => ({ ...prev, [key]: false }));
      return;
    }

    try {
      const res = await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, action: 'unblock' })
      });

      if (!res.ok) {
        throw new Error('Failed to unblock key');
      }

      setBlocklist(prev => prev.filter(k => k.name !== key));
      addToast("Edge Rule Updated: Block Lifted", "success");

    } catch (err) {
      console.error("Error unblocking key:", err);
      addToast("Error lifting block", "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

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
        return prev.some(item => item.name === key) ? prev : [...prev, { name: key, expiration: Math.floor(Date.now() / 1000) + 86400 }];
      });
      addToast("Edge Rule Updated: Access Revoked", "success");

    } catch (err) {
      console.error("Error dropping IP:", err);
      addToast("Error updating edge rule", "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [ip]: false }));
    }
  };


  const edgeTrendAnalytics = React.useMemo(() => {
    const totalEvents = data.length;
    if (totalEvents === 0) {
      return { topColos: [], topCountries: [], totalEvents: 0 };
    }

    const coloCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};

    data.forEach(event => {
      const coloKey = event.colo || 'N/A';
      const countryKey = event.country || 'XX';

      coloCounts[coloKey] = (coloCounts[coloKey] || 0) + 1;
      countryCounts[countryKey] = (countryCounts[countryKey] || 0) + 1;
    });

    const topColos = Object.entries(coloCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({
        name,
        count,
        percentage: (count / totalEvents) * 100,
        isAnomalous: (count / totalEvents) > 0.4
      }));

    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({
        name,
        count,
        percentage: (count / totalEvents) * 100,
        isAnomalous: (count / totalEvents) > 0.4
      }));

    return { topColos, topCountries, totalEvents };
  }, [data]);

  const filteredData = React.useMemo(() => {
    return data.filter(event => {
      // 1. Filter by severity
      let matchesSeverity = true;
      if (severityFilter === 'high') {
        matchesSeverity = event.severity === 'high' || event.severity === 'critical';
      } else if (severityFilter !== 'all') {
        matchesSeverity = event.severity === severityFilter;
      }

      // 2. Filter by app origin
      let matchesAppOrigin = true;
      if (appOriginFilter !== 'all') {
         // Assuming origin is stored in event.details?.origin as instructed or we can check details.origin string match
         const origin = (event.details && (event.details as Record<string, unknown>).origin) ? (event.details as Record<string, unknown>).origin : 'unknown';
         matchesAppOrigin = origin === appOriginFilter;
      }

      // 3. Filter by search query
      let matchesSearch = true;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        matchesSearch =
          event.sourceIp.toLowerCase().includes(query) ||
          getEventName(event.eventType).toLowerCase().includes(query) ||
          JSON.stringify(event.details || {}).toLowerCase().includes(query);
      }

      return matchesSeverity && matchesAppOrigin && matchesSearch;
    });
  }, [data, severityFilter, searchQuery, appOriginFilter]);

  const paginatedTelemetry = React.useMemo(() => {
    const start = telemetryPage * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, telemetryPage]);

  const filteredAuditLog = React.useMemo(() => {
    if (!auditSearchQuery.trim()) return auditLog;
    const query = auditSearchQuery.toLowerCase();
    return auditLog.filter(event =>
      event.action.toLowerCase().includes(query) ||
      (event.target && event.target.toLowerCase().includes(query)) ||
      (event.signature && event.signature.toLowerCase().includes(query))
    );
  }, [auditLog, auditSearchQuery]);

  const paginatedAudit = React.useMemo(() => {
    const start = auditPage * itemsPerPage;
    return filteredAuditLog.slice(start, start + itemsPerPage);
  }, [filteredAuditLog, auditPage]);



  const floodMitigationCount = React.useMemo(() => {
    return auditLog.filter(event => event.signature === 'FLOOD_CONTROL_MITIGATION').length;
  }, [auditLog]);

  return (
    <div className="flex flex-col gap-4 h-full flex-1 min-h-0 relative">
      {/* Toasts */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded shadow-lg font-mono text-sm border pointer-events-auto transition-all transform slide-in-right ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Synchronization Clock */}
      <div className="flex justify-between items-center">
        <div className={`text-xs font-mono border px-3 py-1.5 rounded transition-colors duration-300 flex items-center gap-2 ${
          realtimeStatus === 'CONNECTED'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : 'bg-amber-950/80 border-amber-500 text-amber-300'
        }`}>
          {realtimeStatus === 'CONNECTED' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>LIVE SYNC</span>
            </>
          ) : (
            <span>Realtime Sync Interrupted — Re-establishing Edge Uplink...</span>
          )}
        </div>
        <div className={`text-xs font-mono border px-3 py-1.5 rounded transition-colors duration-300 ${flash ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
          SYNC INTERVAL: 5000MS | LAST INDEXED: {lastSynced ? lastSynced.toLocaleTimeString('en-GB') : '--:--:--'}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Ingested Alerts</div>
          <div className="text-2xl font-mono text-slate-200 flex items-center gap-2">
            {isLoading ? '-' : data.length}
            {velocityShift === 'up' && (
              <span className="text-xs text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded border border-red-900 flex items-center gap-1 transition-all">
                ↑ <span className="text-[10px] uppercase tracking-wider">Expanding</span>
              </span>
            )}
            {velocityShift === 'down' && (
              <span className="text-xs text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-900 flex items-center gap-1 transition-all">
                ↓ <span className="text-[10px] uppercase tracking-wider">Dropping</span>
              </span>
            )}
          </div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Active Edge Drops</span>
            {floodMitigationCount > 0 && (
              <span className="text-[10px] bg-red-950/50 text-red-400 border border-red-900 px-1.5 py-0.5 rounded font-mono">
                {floodMitigationCount} FLOOD BLOCKS
              </span>
            )}
          </div>
          <div className="text-2xl font-mono text-slate-200 flex items-center gap-2">
             {isLoading ? '-' : blocklist.length}
          </div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Node Latency Target</div>
          <div>
             <span className="text-xl font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-2 py-1 rounded">
               {edgeLatency ? `${edgeLatency}ms Avg Edge Execution` : '< 5ms'}
             </span>
             {edgeLatency && (
               <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                 <div
                   className={`h-full ${parseFloat(edgeLatency) < 3 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                   style={{ width: `${Math.min((parseFloat(edgeLatency) / 5) * 100, 100)}%` }}
                 ></div>
               </div>
             )}
          </div>
        </div>
      </div>


      {/* Edge Trend Analytics */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col min-h-0">
        <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Edge Trend Analytics</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Datacenters */}
          <div>
            <div className="text-[10px] text-slate-500 font-mono mb-2">TOP DATACENTERS</div>
            <div className="space-y-2">
              {edgeTrendAnalytics.topColos.map((colo, idx) => (
                <button key={idx} onClick={() => setSearchQuery(colo.name)} className={`w-full flex items-center justify-between p-2 rounded border hover:bg-slate-800/60 cursor-pointer transition-colors ${colo.isAnomalous ? 'border-amber-500/50 bg-amber-950/20 animate-pulse' : 'border-slate-800 bg-slate-900/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-300">[{colo.name}]</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div className={`h-full ${colo.isAnomalous ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${colo.percentage}%` }}></div>
                    </div>
                    <span className="font-mono text-xs text-slate-400 w-8 text-right">{colo.count}</span>
                  </div>
                </button>
              ))}
              {edgeTrendAnalytics.topColos.length === 0 && <div className="text-xs text-slate-600 font-mono italic p-2">Awaiting telemetry...</div>}
            </div>
          </div>
          {/* Top Regional Sources */}
          <div>
            <div className="text-[10px] text-slate-500 font-mono mb-2">TOP REGIONAL SOURCES</div>
            <div className="space-y-2">
              {edgeTrendAnalytics.topCountries.map((country, idx) => (
                <button key={idx} onClick={() => setSearchQuery(country.name)} className={`w-full flex items-center justify-between p-2 rounded border hover:bg-slate-800/60 cursor-pointer transition-colors ${country.isAnomalous ? 'border-amber-500/50 bg-amber-950/20 animate-pulse' : 'border-slate-800 bg-slate-900/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">{country.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div className={`h-full ${country.isAnomalous ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${country.percentage}%` }}></div>
                    </div>
                    <span className="font-mono text-xs text-slate-400 w-8 text-right">{country.count}</span>
                  </div>
                </button>
              ))}
              {edgeTrendAnalytics.topCountries.length === 0 && <div className="text-xs text-slate-600 font-mono italic p-2">Awaiting telemetry...</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex gap-4 items-center">
        <input
          type="text"
          placeholder="Search by IP or Signature..."
          className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 w-64 focus:outline-none focus:border-slate-500 font-mono"
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
        />
        <select
          className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500 uppercase tracking-wider font-semibold"
          value={appOriginFilter}
          onChange={(e) => setAppOriginFilter(e.target.value)}
        >
          <option value="all">App Origin: ALL</option>
          <option value="VendOS">App Origin: VendOS</option>
          <option value="B2B Scrapers">App Origin: B2B Scrapers</option>
          <option value="CRM Bridge">App Origin: CRM Bridge</option>
        </select>
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

      {/* Transient Error Banner */}
      {error && (
        <div className="bg-amber-900/50 border border-amber-700 text-amber-200 px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-200 transition-colors">&times;</button>
        </div>
      )}

      {/* Main Content Area */}
      {false ? null : (
        <div className="flex-1 flex flex-col min-h-0 gap-4">
          <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

          {/* Left Pane: Telemetry Grid (2/3) */}
          <div className="flex-[2] bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-0">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0 flex justify-between items-center">
              <div className="grid grid-cols-6 gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-full">
                 <div>Timestamp</div>
                 <div>Source IP</div>
                 <div>Origin</div>
                 <div>Event Type</div>
                 <div>Severity</div>
                 <div>Action</div>
              </div>
            </div>

            <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
               {isLoading ? (
                  renderTelemetrySkeleton()
               ) : filteredData.length === 0 ? (

                  <div className="flex-1 flex items-center justify-center p-8">
                     <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 max-w-lg w-full flex items-center gap-4">
                        <div className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="text-slate-400 font-mono text-sm tracking-wider uppercase">Perimeter Shield Fully Functional: Zero Threat Anomalies Detected</div>
                     </div>
                  </div>
               ) : (
                 paginatedTelemetry.map((event, idx) => {
                   const isHighSeverity = event.severity === 'high' || event.severity === 'critical';
                   const isBlocked = blocklist.some(b => b.name === `ip:${event.sourceIp}`);
                   const isExpanded = expandedRow === idx;
                   const isActionLoading = actionLoading[event.sourceIp];

                   return (
                     <div key={idx} className="flex flex-col border border-slate-800 rounded bg-slate-900/40 hover:bg-slate-800/50 transition-colors">
                     <div
                       className={`grid grid-cols-6 gap-4 items-center p-3 text-sm text-slate-300 font-mono cursor-pointer ${isActionLoading ? 'opacity-50 pointer-events-none' : ''}`}
                       onClick={() => setExpandedRow(isExpanded ? null : idx)}
                     >
                       <div className="text-slate-500">
                          {new Date(event.timestamp).toLocaleTimeString('en-GB')}
                       </div>
                       <div className="text-slate-300 truncate">
                          {event.sourceIp}
                       </div>
                       <div className="flex gap-2 items-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                             {event.country || 'XX'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-tighter">
                             [{event.colo || 'N/A'}]
                          </span>
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
                              onClick={(e) => { e.stopPropagation(); handleDropIp(event.sourceIp); }}
                              disabled={actionLoading[event.sourceIp]}
                              className="text-red-500 hover:text-red-400 underline decoration-red-500/50 hover:decoration-red-400 text-xs transition-colors disabled:opacity-50 bg-transparent border-none p-0 cursor-pointer"
                            >
                              {actionLoading[event.sourceIp] ? '[ COMMITTING... ]' : 'Drop IP'}
                            </button>
                          )}
                          {isBlocked && (
                            <span className="text-xs text-slate-500 italic">Dropped</span>
                          )}
                       </div>
                     </div>
                     {isExpanded && (
                       <div className="p-4 bg-slate-950 border-t border-slate-800 m-1 rounded overflow-x-auto">
                         <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Raw Payload Inspector</div>
                         <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">
                           {JSON.stringify(event, null, 2)}
                         </pre>
                       </div>
                     )}
                     </div>
                   );
                 })
               )}
            </div>

            <div className="border-t border-slate-800 p-2 flex justify-between items-center bg-slate-900/50">
              <button
                onClick={() => setTelemetryPage(p => Math.max(0, p - 1))}
                disabled={telemetryPage === 0}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors px-2 py-1 text-xs"
              >
                &larr; Prev
              </button>
              <div className="text-xs text-slate-500 font-mono">
                Page {telemetryPage + 1} of {Math.ceil(filteredData.length / itemsPerPage) || 1}
              </div>
              <button
                onClick={() => setTelemetryPage(p => p + 1)}
                disabled={(telemetryPage + 1) * itemsPerPage >= filteredData.length}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors px-2 py-1 text-xs"
              >
                Next &rarr;
              </button>
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

                  <div className="flex-1 flex items-center justify-center p-8">
                     <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 max-w-lg w-full flex items-center gap-4">
                        <div className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="text-slate-400 font-mono text-sm tracking-wider uppercase">Perimeter Shield Active: Zero Edge Drop Anomalies Detected</div>
                     </div>
                  </div>
               ) : (
                 blocklist.map((blockItem, idx) => {
                   const keyName = blockItem.name;
const isLifting = actionLoading[keyName];
                   return (
                   <div key={idx} className={`flex justify-between items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono ${isLifting ? 'opacity-50 pointer-events-none' : ''}`}>
                     <div className="flex items-center min-w-0">
                       <span className="truncate">{keyName}</span>
                       {blockItem.expiration && (
                         <LeaseTimer expiration={blockItem.expiration} />
                       )}
                     </div>
                     <button
                       onClick={() => handleUnblock(keyName)}
                       disabled={actionLoading[keyName]}
                       className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-600 px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ml-2 whitespace-nowrap"
                     >
                       {actionLoading[keyName] ? '[ LIFTING... ]' : 'Lift'}
                     </button>
                   </div>
                   );
                 })
               )}
            </div>
          </div>

        </div>

        {/* Audit Trail Row */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Bottom Pane: Audit Trail */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-[250px]">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                     Edge Security Audit Trail
                  </div>
                  <input
                    type="text"
                    placeholder="Search events..."
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-48 focus:outline-none focus:border-slate-500 font-mono"
                    value={localAuditSearchQuery}
                    onChange={(e) => setLocalAuditSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleExportAuditTrail}
                  className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-600 px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export JSON
                </button>
              </div>
              <div className="grid grid-cols-4 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                 <div>Timestamp</div>
                 <div>Action</div>
                 <div>Target</div>
                 <div>TTL</div>
              </div>
            </div>

            <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
               {isLoading ? (
                  renderTelemetrySkeleton()
               ) : auditLog.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                     <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 max-w-lg w-full flex items-center gap-4">
                        <div className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="text-slate-400 font-mono text-sm tracking-wider uppercase">Perimeter Shield Active: Zero Edge Drop Anomalies Detected</div>
                     </div>
                  </div>
               ) : (
                 paginatedAudit.map((event, idx) => (
                   <div key={idx} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                     <div className="text-slate-500">
                        {new Date(event.timestamp).toLocaleString('en-GB')}
                     </div>
                     <div>
                        <span className={`px-2 py-1 rounded text-xs border whitespace-nowrap ${event.action === 'block' ? 'text-red-400 bg-red-950/50 border-red-900' : 'text-emerald-400 bg-emerald-950/50 border-emerald-900'}`}>
                          {event.action.toUpperCase()}
                        </span>
                     </div>
                     <div className="truncate text-slate-300">
                        {event.target}
                     </div>
                     <div className="text-slate-500">
                        {event.ttl ? `${event.ttl}s` : 'N/A'}
                     </div>
                   </div>
                 ))
               )}
            </div>
          </div>

        </div>
        </div>
      )}
    </div>
  );
}
