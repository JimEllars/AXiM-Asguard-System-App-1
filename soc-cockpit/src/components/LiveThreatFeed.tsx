"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { z } from 'zod';
import { supabase } from '@/utils/supabaseClient';
import { useActiveAccount, useReadContract, useDisconnect, useActiveWallet } from 'thirdweb/react';
import { createThirdwebClient, getContract } from 'thirdweb';
import { arbitrum } from 'thirdweb/chains';


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
  edgeBotScore: z.number().optional(),
  aiThreatFlag: z.boolean().optional(),
  appOrigin: z.string().optional(),
});
type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

const AuditEventSchema = z.object({
  action: z.string(),
  target: z.string(),
  ttl: z.number().optional(),
  timestamp: z.number(),
  signature: z.string().optional(),
  authorizedByWallet: z.string().optional(),
});
type AuditEvent = z.infer<typeof AuditEventSchema>;

const DlqRecordSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  originNode: z.string(),
  droppedRoute: z.string(),
  errorReason: z.string(),
  status: z.string().optional(),
  payload: z.any().optional(),
});
type DlqRecord = z.infer<typeof DlqRecordSchema>;

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'default-client-id',
});

const adminSbtContract = getContract({
  client,
  chain: arbitrum,
  address: '0x0000000000000000000000000000000000000000',
});




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
  const handleExportAuditCSV = () => {
    if (!auditLog || auditLog.length === 0) return;
    const header = "Timestamp,Action,Target Key,TTL,Authorized Wallet\n";
    const rows = auditLog.map(event => {
      const timestamp = new Date(event.timestamp).toISOString();
      const action = event.action || "";
      const target = event.target || "";
      const ttl = event.ttl !== undefined ? event.ttl.toString() : "";
      const wallet = event.authorizedByWallet || "";
      // Escape fields containing commas or quotes
      const row = [timestamp, action, target, ttl, wallet].map(field => {
        if (field.includes(',') || field.includes('"')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      }).join(',');
      return row;
    });
    const csvString = header + rows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `asguard_audit_log_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const [annotations, setAnnotations] = React.useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = sessionStorage.getItem('asguard_annotations');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const handleAnnotationChange = (key: string, value: string) => {
    if (value.length > 60) return;
    const newAnnotations = { ...annotations, [key]: value };
    setAnnotations(newAnnotations);
    sessionStorage.setItem('asguard_annotations', JSON.stringify(newAnnotations));
  };

  const handleAnnotationBlur = async (key: string) => {
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;
    if (!workerUrl || !apiKey) return;

    try {
      await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, action: 'update_note', note: annotations[key] || '' })
      });
    } catch (err) {
      console.error("Error saving note:", err);
    }
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [data, setData] = useState<TelemetryPayload[]>([]);
  const [blocklist, setBlocklist] = useState<{ name: string; expiration?: number; note?: string }[]>([]);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const autoRefreshRef = useRef(autoRefresh);
  useEffect(() => { autoRefreshRef.current = autoRefresh; }, [autoRefresh]);
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'unknown'>('unknown');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [edgeMetrics, setEdgeMetrics] = useState({ rateLimitSize: 0, penaltyLedgerSize: 0 });
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
  const activeAccount = useActiveAccount();

  const { disconnect } = useDisconnect();
  const activeWallet = useActiveWallet();
  const [sbtEvalTrigger, setSbtEvalTrigger] = useState<number>(Date.now());

  // Restrict re-evaluation loops to manual synchronization events or on page mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sbtParams = React.useMemo(() => [activeAccount?.address || "0x0000000000000000000000000000000000000000"] as const, [activeAccount?.address, sbtEvalTrigger]);
  const { data: sbtBalance, isLoading: isSbtLoading } = useReadContract({
    contract: adminSbtContract,
    method: "function balanceOf(address owner) view returns (uint256)",
    params: sbtParams as readonly [string],
    queryOptions: {
      enabled: !!activeAccount?.address,
    },
  });
  const hasAdminSbt: boolean = (sbtBalance && sbtBalance > BigInt(0)) ? true : false;


  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>((searchParams?.get('severity') as 'all' | 'high' | 'medium' | 'low') || 'all');
  const [aiUnsafeOnly, setAiUnsafeOnly] = useState<boolean>(false);
  const [appOriginFilter, setAppOriginFilter] = useState<string>(searchParams?.get('origin') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams?.get('search') || '');
  const [localSearchQuery, setLocalSearchQuery] = useState(searchParams?.get('search') || '');
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

  const [dlqRecords, setDlqRecords] = useState<DlqRecord[]>([]);
  const [dlqSearchQuery, setDlqSearchQuery] = useState('');
  const [dlqView, setDlqView] = useState<'active' | 'quarantined'>('active');
  const [debouncedDlqSearch, setDebouncedDlqSearch] = useState('');
  const [replayingState, setReplayingState] = useState<Record<string, boolean>>({});
  const [copiedAuditRow, setCopiedAuditRow] = useState<string | null>(null);

  const handleCopyAuditRow = (event: AuditEvent, rowId: string) => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopiedAuditRow(rowId);
    setTimeout(() => {
      setCopiedAuditRow(null);
    }, 1500);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDlqSearch(dlqSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [dlqSearchQuery]);


  const filteredDlq = dlqRecords.filter(record => dlqView === 'quarantined' ? record.status === 'quarantined' : record.status !== 'quarantined').filter(record =>
    record.originNode.toLowerCase().includes(debouncedDlqSearch.toLowerCase()) ||
    record.droppedRoute.toLowerCase().includes(debouncedDlqSearch.toLowerCase()) ||
    record.errorReason.toLowerCase().includes(debouncedDlqSearch.toLowerCase())
  ).slice(0, 30);




  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
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
  const [auditTimeRange, setAuditTimeRange] = useState<"all" | "1h" | "24h">("all");

  const itemsPerPage = 10;


  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'emerald' }[]>([]);

  const addToast = React.useCallback((message: string, type: 'success' | 'error' | 'emerald') => {
    const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);



  useEffect(() => {
    const fetchBackgroundStatus = async () => {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      if (!workerUrl || !apiKey) return;

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 4000);
      try {
        const [healthRes, dlqRes, blocklistRes, auditRes] = await Promise.all([
          fetch(`${workerUrl}/health`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/dlq`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/blocklist`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/audit`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          })
        ]);
        clearTimeout(timeoutId);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setEdgeMetrics({ rateLimitSize: healthData.rateLimitSize || 0, penaltyLedgerSize: healthData.penaltyLedgerSize || 0 });
          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
        } else {
          setHealthStatus('degraded');
        }

        if (dlqRes.ok) {
          const dlqData = await dlqRes.json();
          setDlqRecords(dlqData.slice(0, 50));
        }

        if (blocklistRes.ok) {
           const blocklistData = await blocklistRes.json();
           const parsedBlocklist = z.array(z.object({ name: z.string(), expiration: z.number().optional(), note: z.string().optional() })).parse(blocklistData);
           setBlocklist(parsedBlocklist);
        }

        if (auditRes.ok) {
           const auditData = await auditRes.json();
           const parsedAudit = z.array(AuditEventSchema).parse(auditData);
           setAuditLog(parsedAudit.slice(0, 50));
        }
      } catch (err) {
        console.error("Background polling failed", err);
        setHealthStatus('degraded');
        // Gracefully preserve last indexed edgeMetrics allocation sizes by not overwriting them
      }
    };

    const interval = setInterval(fetchBackgroundStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (!autoRefreshRef.current) return;
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

      const abortController = new AbortController();
      const timeoutIdFetch = setTimeout(() => abortController.abort(), 4000);
      try {
        const [telemetryRes, blocklistRes, auditRes, healthRes, dlqRes] = await Promise.all([
          fetch(`${workerUrl}/telemetry`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/blocklist`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/audit`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/health`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          }),
          fetch(`${workerUrl}/dlq`, {
            headers: { 'X-Asguard-Auth': apiKey },
            signal: abortController.signal
          })
        ]);
        clearTimeout(timeoutIdFetch);

        if (!telemetryRes.ok) {
          throw new Error(`Failed to fetch telemetry: ${telemetryRes.statusText}`);
        }
        if (!blocklistRes.ok) {
          throw new Error(`Failed to fetch blocklist: ${blocklistRes.statusText}`);
        }
        if (!auditRes.ok) {
          throw new Error(`Failed to fetch audit: ${auditRes.statusText}`);
        }

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setEdgeMetrics({ rateLimitSize: healthData.rateLimitSize || 0, penaltyLedgerSize: healthData.penaltyLedgerSize || 0 });
          setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
        } else {
          setHealthStatus('degraded');
        }

        if (!dlqRes.ok) {
          throw new Error(`Failed to fetch DLQ: ${dlqRes.statusText}`);
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
        const jsonDlqData = await dlqRes.json();

        const parsedData = z.array(TelemetryPayloadSchema).parse(jsonTelemetryData).slice(0, 50);
        const parsedBlocklist = z.array(z.object({ name: z.string(), expiration: z.number().optional(), note: z.string().optional() })).parse(jsonBlocklistData);
        setAnnotations(prev => {
          let updated = false;
          const next = { ...prev };
          for (const item of parsedBlocklist) {
            if (item.note !== undefined && next[item.name] !== item.note) {
              next[item.name] = item.note;
              updated = true;
            }
          }
          if (updated) {
            sessionStorage.setItem('asguard_annotations', JSON.stringify(next));
            return next;
          }
          return prev;
        });
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
        const parsedDlq = z.array(DlqRecordSchema).parse(jsonDlqData);
        setBlocklist(prev => JSON.stringify(prev) !== JSON.stringify(parsedBlocklist) ? parsedBlocklist : prev);
        setAuditLog(prev => JSON.stringify(prev) !== JSON.stringify(parsedAudit.slice(0, 50)) ? parsedAudit.slice(0, 50) : prev);
        setDlqRecords(prev => JSON.stringify(prev) !== JSON.stringify(parsedDlq.slice(0, 50)) ? parsedDlq.slice(0, 50) : prev);
        setLastSynced(new Date());
        setError(null);

        setFlash(true);
        setTimeout(() => setFlash(false), 500);

      } catch (err: unknown) {
        console.error("Error fetching data:", err);
        setHealthStatus('degraded');
        if (err instanceof Error && err.name === "AbortError") {
          setError("[ EDGE SYNC TIMEOUT: RETRYING ADAPTIVE INTERCEPTOR CHANNELS ]");
        } else if (err instanceof Error) {
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

            if (payload.new && autoRefreshRef.current) {
               const newLog: Record<string, unknown> = { ...payload.new };
               for (const key in newLog) {
                   if (newLog[key] === null) {
                       newLog[key] = undefined;
                   }
               }
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

    setTelemetryPage(0);
  }, [severityFilter, searchQuery, appOriginFilter]);


  const syncAbortControllerRef = React.useRef<AbortController | null>(null);

  const handleManualSync = React.useCallback(async () => {
    if (syncAbortControllerRef.current) {
      syncAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    syncAbortControllerRef.current = abortController;
    setIsSyncing(true);
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 2000);
    setSbtEvalTrigger(Date.now());
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;
    if (workerUrl && apiKey) {
       // Using an out of band fetch to the background status endpoint, which is essentially hitting /health, /dlq, /blocklist, /audit
       const authHeaders = { 'X-Asguard-Auth': apiKey };

       try {
           const signal = abortController.signal;
           const [healthRes, dlqRes, blocklistRes, auditRes] = await Promise.all([
              fetch(`${workerUrl}/health`, { headers: authHeaders, signal }),
              fetch(`${workerUrl}/api/dlq`, { headers: authHeaders, signal }),
              fetch(`${workerUrl}/blocklist`, { headers: authHeaders, signal }),
              fetch(`${workerUrl}/audit`, { headers: authHeaders, signal })
           ]);

           if (healthRes.ok) {
              const healthData = await healthRes.json();
              setEdgeMetrics({ rateLimitSize: healthData.rateLimitSize || 0, penaltyLedgerSize: healthData.penaltyLedgerSize || 0 });
              setHealthStatus(healthData.status === 'ok' && healthData.blacklist === 'ok' && healthData.telemetry === 'ok' ? 'ok' : 'degraded');
           }
           if (dlqRes.ok) setDlqRecords(await dlqRes.json().then(d => d.slice(0, 50)));
           if (blocklistRes.ok) {
               const blocklistData = await blocklistRes.json();
               const parsedBlocklist = z.array(z.object({ name: z.string(), expiration: z.number().optional(), note: z.string().optional() })).parse(blocklistData);
               setBlocklist(parsedBlocklist);
           }
           if (auditRes.ok) {
               const auditData = await auditRes.json();
               const parsedAudit = z.array(AuditEventSchema).parse(auditData);
               setAuditLog(parsedAudit.slice(0, 50));
           }

           const telemetryRes = await fetch(`${workerUrl}/telemetry`, { headers: authHeaders, signal: abortController.signal });
           if (telemetryRes.ok) {
              const telemetryData = await telemetryRes.json();
              const parsedData = z.array(TelemetryPayloadSchema).parse(telemetryData).slice(0, 50);
              setData(parsedData);
              setLastSynced(new Date());
              setIsSyncing(false);
              addToast("SYNC COMPLETE", "emerald");
           }
       } catch (err) {
           setHealthStatus('degraded');
           if ((err as Error).name === 'AbortError') {
               console.log('Manual sync aborted due to new request');
               setIsSyncing(false);
           } else {
               console.error("Manual sync failed", err);
               setIsSyncing(false);
           }
       }
    }
  }, [addToast]);

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






  const handleUnquarantine = async (id: string) => {
    try {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      if (!workerUrl || !apiKey) {
        throw new Error("Missing environment credentials");
      }

      const res = await fetch(`${workerUrl}/dlq/unquarantine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Asguard-Auth': apiKey,
          'X-Asguard-Signature': activeAccount?.address || 'UNKNOWN'
        },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error("Unquarantine failed");

      setDlqRecords(prev => prev.map(r => r.id === id ? { ...r, status: undefined } : r));
      addToast("[ ITEM UNQUARANTINED ]", "success");
    } catch (err) {
      addToast("Failed to unquarantine DLQ item", "error");
    }
  };

const handlePurgeDlqItem = async (id: string) => {
    try {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      if (!workerUrl || !apiKey) {
        throw new Error("Missing environment credentials");
      }

      const res = await fetch(`${workerUrl}/dlq?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'X-Asguard-Auth': apiKey,
          'X-Asguard-Signature': activeAccount?.address || 'UNKNOWN'
        }
      });
      if (!res.ok) throw new Error("Purge failed");

      setDlqRecords(prev => prev.filter(r => r.id !== id));
      addToast("[ ITEM PURGED ]", "success");
    } catch (err) {
      addToast("Failed to purge item", "error");
    }
  };

  const handleReplayPayload = async (id: string, fullEvent: unknown) => {
    setReplayingState(prev => ({ ...prev, [id]: true }));

    try {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      if (!workerUrl || !apiKey) {
        throw new Error("Missing environment credentials");
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5000);
      const response = await fetch(`${workerUrl}/api/dlq/bulk-replay`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fullEvent),
        signal: abortController.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        setDlqRecords(prev => prev.filter(record => record.id !== id));
      } else {
        console.error("Failed to replay DLQ payload");
      }

      addToast(`Payload ${id} successfully replayed.`, 'emerald');
    } catch (error) {
      addToast('Failed to replay payload.', 'error');
    } finally {
      setReplayingState(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

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

    const abortController = new AbortController();
    const timeoutIdFetch = setTimeout(() => abortController.abort(), 4000);
    try {
      const res = await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, action: 'unblock' }),
        signal: abortController.signal
      });
      clearTimeout(timeoutIdFetch);

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


  const handleBlock = async (key: string, ttl: number, reason: string) => {
    setActionLoading(prev => ({ ...prev, [key]: true }));
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

    if (!workerUrl || !apiKey) {
      console.error("Missing credentials for action");
      setActionLoading(prev => ({ ...prev, [key]: false }));
      return;
    }

    const abortController = new AbortController();
    const timeoutIdFetch = setTimeout(() => abortController.abort(), 4000);
    try {
      const res = await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, action: 'block', ttl, details: { reason } }),
        signal: abortController.signal
      });
      clearTimeout(timeoutIdFetch);

      if (!res.ok) {
        throw new Error('Failed to block');
      }

      // Optimistically update the blocklist
      setBlocklist(prev => {
        return prev.some(item => item.name === key) ? prev : [...prev, { name: key, expiration: Math.floor(Date.now() / 1000) + ttl }];
      });
      addToast("[ MITIGATION APPLIED ]", "emerald");

    } catch (err) {
      console.error("Error blocking:", err);
      addToast("Error updating edge rule", "error");
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

    const abortController = new AbortController();
    const timeoutIdFetch = setTimeout(() => abortController.abort(), 4000);
    try {
      const res = await fetch(`${workerUrl}/blocklist`, {
        method: 'POST',
        headers: {
          'X-Asguard-Auth': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: `ip:${ip}`, action: 'block' }),
        signal: abortController.signal
      });
      clearTimeout(timeoutIdFetch);

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
         const origin = event.appOrigin || 'unknown';
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

      // 4. Filter by AI Unsafe Only
      let matchesAiUnsafe = true;
      if (aiUnsafeOnly) {
          matchesAiUnsafe = event.aiThreatFlag === true;
      }

      return matchesSeverity && matchesAppOrigin && matchesSearch && matchesAiUnsafe;
    });
  }, [data, severityFilter, searchQuery, appOriginFilter, aiUnsafeOnly]);

  const paginatedTelemetry = React.useMemo(() => {
    const start = telemetryPage * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, telemetryPage]);



  const filteredAuditLog = React.useMemo(() => {
    let filtered = auditLog;

    if (auditTimeRange !== "all") {
      const now = Date.now();
      const windowMs = auditTimeRange === "1h" ? 3600000 : 86400000;
      filtered = filtered.filter(event => event.timestamp >= now - windowMs);
    }

    if (!auditSearchQuery.trim()) return filtered;

    const query = auditSearchQuery.toLowerCase();
    return filtered.filter(event =>
      event.action.toLowerCase().includes(query) ||
      (event.target && event.target.toLowerCase().includes(query)) ||
      (event.signature && event.signature.toLowerCase().includes(query))
    );
  }, [auditLog, auditSearchQuery, auditTimeRange]);

  const paginatedAudit = React.useMemo(() => {
    const start = auditPage * itemsPerPage;
    return filteredAuditLog.slice(start, start + itemsPerPage);
  }, [filteredAuditLog, auditPage]);



  const floodMitigationCount = React.useMemo(() => {
    return auditLog.filter(event => event.signature === 'FLOOD_CONTROL_MITIGATION').length;
  }, [auditLog]);

  const hasHighDensityAnomaly = React.useMemo(() => {
    if (data.length === 0) return { isAnomaly: false, ip: '', percentage: 0 };
    const currentViewport = data.slice(0, 50);
    const counts: Record<string, number> = {};
    for (const event of currentViewport) {
      counts[event.sourceIp] = (counts[event.sourceIp] || 0) + 1;
    }
    const totalViewportLogs = currentViewport.length;
    let maxIp = '';
    let maxCount = 0;

    for (const [ip, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxIp = ip;
      }
    }

    const percentage = (maxCount / totalViewportLogs) * 100;
    const threshold = totalViewportLogs * 0.20;

    if (maxCount > threshold) {
      return { isAnomaly: true, ip: maxIp, percentage: Math.round(percentage) };
    }
    return { isAnomaly: false, ip: '', percentage: 0 };
  }, [data]);

  if (activeAccount?.address && !isSbtLoading && !hasAdminSbt) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-950">
        <div className="bg-slate-900 border border-red-900 p-8 rounded-lg max-w-2xl w-full text-center">
          <p className="text-red-500 font-mono text-lg font-bold tracking-widest uppercase">
            [ CRYPTOGRAPHIC AUTHORIZATION FAILURE: AXIM SECURITY ADMIN SOULBOUND TOKEN REQUIRED ]
          </p>
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => { if (activeWallet) disconnect(activeWallet); }}
              className="px-6 py-3 bg-red-950 hover:bg-red-900 border border-red-500 text-red-500 font-mono text-sm font-bold tracking-wider uppercase transition-colors"
            >
              [ DISCONNECT WALLET ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full flex-1 min-h-0 relative">
      {/* Toasts */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded shadow-lg font-mono text-sm border pointer-events-auto transition-all transform slide-in-right ${
              (toast.type === 'success' || toast.type === 'emerald')
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Onyx Triage Banner */}
      {hasHighDensityAnomaly.isAnomaly && (
        <div
          onClick={() => {
            setLocalSearchQuery(hasHighDensityAnomaly.ip);
            setSearchQuery(hasHighDensityAnomaly.ip);
          }}
          className="bg-red-950/80 border-b border-red-500 text-red-200 px-4 py-2 text-center font-mono text-sm font-bold tracking-wider uppercase mb-2 cursor-pointer hover:bg-red-900/80 transition-colors"
        >
          [ CRITICAL ANOMALY DETECTED: IP {hasHighDensityAnomaly.ip} REPRESENTS {hasHighDensityAnomaly.percentage}% OF ACTIVE EDGE BLOCKS ]
        </div>
      )}

      {/* AI Guard Status */}
      <div className="text-xs bg-purple-950/50 border border-purple-900 px-3 py-1.5 rounded-md text-purple-400 font-mono flex items-center gap-2 mb-2 w-max">
        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
        WORKERS_AI_GUARD: LLAMA-GUARD-3 ACTIVE
      </div>

      {/* Synchronization Clock */}
      <div className="flex flex-col sm:flex-row flex-wrap justify-between items-center gap-2 md:gap-3">
        <div className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 ${
          healthStatus === 'ok'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : healthStatus === 'degraded'
            ? 'bg-amber-950/80 border-amber-500 text-amber-300'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }`}>
          {healthStatus === 'ok' ? 'STATUS: PERIMETER SECURE' : healthStatus === 'degraded' ? 'STATUS: PERIMETER DEGRADED' : 'STATUS: UNKNOWN'}
          <span className={`h-2 w-2 rounded-full ${healthStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : healthStatus === 'degraded' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></span>
        </div>

        {/* Memory Allocation Tooltip */}
        <div className="relative group text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded flex items-center gap-2 bg-slate-900 border-slate-700 text-slate-400 cursor-help transition-colors hover:bg-slate-800">
           EDGE METRICS [?]
           <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs opacity-0 transition-opacity group-hover:opacity-100 bg-slate-800 text-slate-200 text-[10px] rounded px-3 py-2 border border-slate-600 shadow-xl z-50 whitespace-nowrap">
             [ FLOOD LEDGER: {edgeMetrics.rateLimitSize}/10000 | PENALTY LEDGER: {edgeMetrics.penaltyLedgerSize}/1000 ]
           </div>
        </div>

        {/* Wallet Status Badge */}
        <div className="text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 flex items-center gap-2 bg-slate-950/80 border-slate-700 text-slate-300">
          {activeAccount ? (
            <span>WALLET: {activeAccount.address.slice(0, 4)}...{activeAccount.address.slice(-2)}</span>
          ) : (
            <span>[ AUTH: WEB2 PROXIED GATEWAY MODE ]</span>
          )}
        </div>
        <div className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 flex items-center gap-2 ${
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
        <div className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 ${flash ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
          SYNC INTERVAL: 5000MS | LAST INDEXED: {lastSynced ? lastSynced.toLocaleTimeString('en-GB') : '--:--:--'}
        </div>
        <button
           onClick={() => setAutoRefresh(prev => !prev)}
           className={`px-2 py-1 rounded text-[10px] font-mono transition-colors border ${
             autoRefresh
               ? "bg-emerald-950/50 text-emerald-400 border-emerald-800"
               : "bg-amber-950/50 text-amber-400 border-amber-800"
           }`}
        >
           {autoRefresh ? "[ AUTO-REFRESH: ON ]" : "[ PAUSED ]"}
        </button>
        <button
           onClick={handleManualSync}
           disabled={isSyncing || isCooldown}
           className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-300 flex items-center gap-2 disabled:opacity-50 ${isCooldown && !isSyncing ? 'opacity-50' : ''}`}
        >
           {isSyncing ? '[ SYNCING LOGS... ]' : isCooldown ? '[ COOLING DOWN... ]' : 'SYNC NOW'}
        </button>
      </div>

      {/* Capacity Progress Bars */}
      <div className="flex flex-col gap-2 mt-2">
         {/* Rate Limit Size Bar */}
         <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
               <span>Rate Limit Map Depth</span>
               <span>{edgeMetrics.rateLimitSize} / 10000</span>
            </div>
            <div className="w-full bg-slate-900 border border-slate-700 rounded h-2 overflow-hidden">
               <div
                  className={`h-full transition-all duration-500 ${edgeMetrics.rateLimitSize / 10000 > 0.7 ? 'bg-amber-500' : 'bg-slate-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (edgeMetrics.rateLimitSize / 10000) * 100))}%` }}
               ></div>
            </div>
         </div>
         {/* Penalty Ledger Size Bar */}
         <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
               <span>Penalty Ledger Depth</span>
               <span>{edgeMetrics.penaltyLedgerSize} / 1000</span>
            </div>
            <div className="w-full bg-slate-900 border border-slate-700 rounded h-2 overflow-hidden">
               <div
                  className={`h-full transition-all duration-500 ${edgeMetrics.penaltyLedgerSize / 1000 > 0.7 ? 'bg-amber-500' : 'bg-slate-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (edgeMetrics.penaltyLedgerSize / 1000) * 100))}%` }}
               ></div>
            </div>
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
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col gap-4">
        <div className="flex gap-4 items-center w-full">
          <input
            type="text"
            placeholder="Search by IP or Signature..."
            className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 w-64 focus:outline-none focus:border-slate-500 font-mono"
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
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
          <button
            onClick={() => setAiUnsafeOnly(prev => !prev)}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors border ${
              aiUnsafeOnly
                ? 'bg-purple-900/60 text-purple-300 border-purple-600'
                : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-300'
            }`}
          >
            [ AI-UNSAFE ONLY ]
          </button>
        </div>

        {/* App Origin Pill Selectors */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">App Origin:</div>
          {['all', 'AXiM Academy', 'The Green Machine', 'Nexus CRM', 'Web3 Frontend', 'AXiM Macro Core Gateway'].map(origin => (
            <button
              key={origin}
              onClick={() => setAppOriginFilter(origin)}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-colors border ${appOriginFilter === origin ? 'bg-indigo-900/50 text-indigo-300 border-indigo-700' : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:bg-slate-800/80 hover:text-slate-300'}`}
            >
              {origin === 'all' ? 'ALL ORIGINS' : origin}
            </button>
          ))}
        </div>
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
            {hasHighDensityAnomaly.isAnomaly && (
              <div
                onClick={() => {
                  setLocalSearchQuery(hasHighDensityAnomaly.ip);
                  setSearchQuery(hasHighDensityAnomaly.ip);
                }}
                className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-amber-500 font-mono text-xs font-bold tracking-widest uppercase cursor-pointer hover:bg-amber-500/20 transition-colors"
              >
                [ SYSTEM ACCELERATION ALERT: HIGH-DENSITY IP ANOMALY - ONYX COGNITIVE TRIAGE REQ ]
              </div>
            )}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0 flex justify-between items-center">
              {selectedIps.size > 0 && (
                 <button onClick={() => { selectedIps.forEach(ip => handleBlock(`ip:${ip}`, 86400, "Batch Block via Threat Feed")); setSelectedIps(new Set()); addToast("[ BATCH MITIGATION APPLIED ]", "success"); }} className="absolute right-4 top-2 text-[10px] font-mono bg-red-950/80 text-red-400 border border-red-900 px-3 py-1 rounded hover:bg-red-900/50 transition-colors z-20">
                   [ BLOCK SELECTED ({selectedIps.size}) ]
                 </button>
              )}
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-full">
                 <div></div>
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
                     <div key={`${event.sourceIp}-${event.timestamp}-${idx}`} className={`flex flex-col border font-mono tracking-tight transition-all duration-500 ${flash && idx === 0 && telemetryPage === 0 ? 'bg-emerald-950/30 border-l-2 border-l-emerald-500 border-y-slate-800/50 border-r-slate-800/50' : 'border-slate-800/50 bg-slate-950/40 hover:bg-slate-800/50'}`}>
                     <div
                       className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center p-3 text-sm text-slate-300 font-mono cursor-pointer ${isActionLoading ? 'opacity-50 pointer-events-none' : ''}`}
                       onClick={() => setExpandedRow(isExpanded ? null : idx)}
                     >
                       <div><input type="checkbox" onClick={(e) => e.stopPropagation()} onChange={(e) => { const ip = event.sourceIp; setSelectedIps(prev => { const next = new Set(prev); if (e.target.checked) next.add(ip); else next.delete(ip); return next; }); }} checked={selectedIps.has(event.sourceIp)} className="cursor-pointer" /></div>
                       <div className="text-slate-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString('en-GB')}
                       </div>
                       <div className="text-slate-300 truncate">
                          {event.sourceIp}
                       </div>
                       <div className="flex gap-2 items-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                             {event.country || 'XX'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-tight">
                             [{event.colo || 'N/A'}]
                          </span>
                       </div>
                       <div className="truncate flex items-center gap-2">
                          {event.aiThreatFlag && (
                             <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-400 border border-purple-700/50 uppercase">
                               [ AI-UNSAFE ]
                             </span>
                          )}
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
                       <div className="p-4 bg-slate-950 border-t border-slate-800 m-1 rounded overflow-x-auto relative">
                         {typeof event.edgeBotScore === 'number' && (
                           <div className="mb-2">
                             {event.edgeBotScore < 30 ? (
                               <span className="inline-block bg-red-950/50 text-red-500 font-bold border border-red-900 px-2 py-1 rounded text-xs">
                                 [ ANTIBOT TRIAGE &mdash; BOT SCORE: {event.edgeBotScore} ]
                               </span>
                             ) : (
                               <span className="inline-block bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded text-xs">
                                 [ BOT SCORE: {event.edgeBotScore} ]
                               </span>
                             )}
                           </div>
                         )}
                         <div className="flex justify-between items-center mb-2">
                           <div className="text-xs text-slate-500 uppercase tracking-wider">Raw Payload Inspector</div>

                           <div className="flex gap-2">
                             {event.sourceIp && !blocklist.some(b => b.name === `ip:${event.sourceIp}`) && (
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleBlock(`ip:${event.sourceIp}`, 86400, "Blocked via Live Threat Inspector");
                                 }}
                                 disabled={actionLoading[`ip:${event.sourceIp}`]}
                                 className="text-[10px] bg-red-950/30 hover:bg-red-900/50 border border-red-900 text-red-400 px-2 py-1 rounded transition-colors font-mono disabled:opacity-50"
                               >
                                 {actionLoading[`ip:${event.sourceIp}`] ? '[ COMMITTING... ]' : `[ BLOCK IP: ${event.sourceIp} ]`}
                               </button>
                             )}
                             {!!(event as Record<string, unknown>).web3WalletAddress && !blocklist.some(b => b.name === `wallet:${(event as Record<string, unknown>).web3WalletAddress}`) && (
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleBlock(`wallet:${(event as Record<string, unknown>).web3WalletAddress}`, 86400, "Blocked via Live Threat Inspector");
                                 }}
                                 disabled={actionLoading[`wallet:${(event as Record<string, unknown>).web3WalletAddress}`]}
                                 className="text-[10px] bg-red-950/30 hover:bg-red-900/50 border border-red-900 text-red-400 px-2 py-1 rounded transition-colors font-mono disabled:opacity-50"
                               >
                                 {actionLoading[`wallet:${(event as Record<string, unknown>).web3WalletAddress}`] ? '[ COMMITTING... ]' : '[ BLOCK WALLET ]'}
                               </button>
                             )}
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               const sanitizePayload = (obj: unknown) => {
                                 const clone = JSON.parse(JSON.stringify(obj));
                                 const sensitiveKeys = ['authorization', 'cookie', 'token', 'signature', 'secret'];

                                 const traverse = (o: Record<string, unknown> | unknown[]) => {
                                   if (o && typeof o === 'object') {
                                     for (const k in o) {
                                       const obj = o as Record<string, unknown>;
                                       if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
                                         obj[k] = '[ REDACTED_FOR_COMPLIANCE ]';
                                       } else if (typeof obj[k] === 'object') {
                                         traverse(obj[k] as Record<string, unknown>);
                                       }
                                     }
                                   }
                                 };
                                 traverse(clone);
                                 return clone;
                               };
                               navigator.clipboard.writeText(JSON.stringify(sanitizePayload(event), null, 2));
                               setCopiedRow(idx);
                               setTimeout(() => setCopiedRow(null), 1500);
                             }}
                             className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors font-mono"
                           >
                             {copiedRow === idx ? '[ COPIED! ]' : 'Copy JSON'}
                           </button>
                           </div>
                         </div>
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
                   <div key={idx} className={`flex flex-col gap-2 p-3 rounded border border-slate-800/50 bg-slate-950/40 font-mono tracking-tight hover:bg-slate-800/50 transition-colors text-sm text-slate-300 ${isLifting ? 'opacity-50 pointer-events-none' : ''}`}>
                     <div className="flex justify-between items-center">
                       <div className="flex items-center min-w-0">
                         {keyName.startsWith('wallet:') && (
                           <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-amber-400 border border-amber-900/50 bg-amber-950/20 mr-2">
                             WALLET
                           </span>
                         )}
                         {(blockItem.note && typeof blockItem.note === 'string' && (blockItem.note.toLowerCase().includes('autonomous') || blockItem.note.toLowerCase().includes('ai'))) && (
                           <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-indigo-400 border border-indigo-900/50 bg-indigo-950/30 mr-2">
                             AUTONOMOUS BLOCK
                           </span>
                         )}
                         <span className="truncate font-mono">{keyName}</span>
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
                     <div className="flex">
                        <input
                           type="text"
                           placeholder="Add triage note..."
                           maxLength={60}
                           value={annotations[keyName] || ''}
                           onChange={(e) => handleAnnotationChange(keyName, e.target.value)}
                           onBlur={() => handleAnnotationBlur(keyName)}
                           className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-slate-500 placeholder-slate-600"
                        />
                     </div>
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
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-4">
                     <span>Edge Security Audit Trail</span>
                     <button onClick={handleExportAuditCSV} className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 bg-cyan-950/30 px-2 py-0.5 rounded transition-colors cursor-pointer">
                       [ EXPORT CSV ]
                     </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search events..."
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-48 focus:outline-none focus:border-slate-500 font-mono"
                    value={localAuditSearchQuery}
                    onChange={(e) => setLocalAuditSearchQuery(e.target.value)}
                  />
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => { setAuditTimeRange("all"); setAuditPage(0); }}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer border ${auditTimeRange === "all" ? "text-cyan-400 border-cyan-800 bg-cyan-950/30" : "text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700 bg-slate-950/30"}`}
                    >
                      [ ALL TIME ]
                    </button>
                    <button
                      onClick={() => { setAuditTimeRange("1h"); setAuditPage(0); }}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer border ${auditTimeRange === "1h" ? "text-cyan-400 border-cyan-800 bg-cyan-950/30" : "text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700 bg-slate-950/30"}`}
                    >
                      [ 1 HOUR ]
                    </button>
                    <button
                      onClick={() => { setAuditTimeRange("24h"); setAuditPage(0); }}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer border ${auditTimeRange === "24h" ? "text-cyan-400 border-cyan-800 bg-cyan-950/30" : "text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700 bg-slate-950/30"}`}
                    >
                      [ 24 HOURS ]
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleExportAuditTrail}
                  className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-600 px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export JSON
                </button>
              </div>
              <div className="grid grid-cols-6 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                 <div>Timestamp</div>
                 <div>Action</div>
                 <div>Target</div>
                 <div>TTL</div>
                 <div>Authorized By</div>
                 <div className="text-right">Actions</div>
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
                 paginatedAudit.map((event, idx) => {
                 const rowId = `${event.target || "target"}-${event.timestamp}-${idx}`;
                 return (
                   <div key={rowId} className="grid grid-cols-6 gap-4 items-center p-3 rounded border border-slate-800/50 bg-slate-950/40 font-mono tracking-tight hover:bg-slate-800/50 transition-colors text-sm text-slate-300">
                     <div className="text-slate-500 font-mono">
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
                     <div className="text-slate-400 truncate">
                        {event.authorizedByWallet || 'N/A'}
                     </div>
                     <div className="text-right">
                        <button
                           onClick={() => handleCopyAuditRow(event, rowId)}
                           className="font-mono text-[10px] text-slate-400 hover:text-white transition-colors uppercase cursor-pointer"
                        >
                           {copiedAuditRow === rowId ? <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-1 py-0.5 rounded">[ COPIED! ]</span> : "[ COPY ]"}
                        </button>
                     </div>
                   </div>
                 );
                 })
               )}
            </div>
            <div className="border-t border-slate-800 p-2 flex justify-between items-center bg-slate-900/50">
              <button
                onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                disabled={auditPage === 0}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors px-2 py-1 text-xs"
              >
                &larr; Prev
              </button>
              <div className="text-xs text-slate-500 font-mono">
                Page {auditPage + 1} of {Math.ceil(filteredAuditLog.length / itemsPerPage) || 1}
              </div>
              <button
                onClick={() => setAuditPage(p => p + 1)}
                disabled={(auditPage + 1) * itemsPerPage >= filteredAuditLog.length}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors px-2 py-1 text-xs"
              >
                Next &rarr;
              </button>
            </div>

          </div>

        </div>

          {/* Bottom Pane: Dead Letter Queue (DLQ) */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-[250px] mt-4">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>

            <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                     Ecosystem Dead Letter Queue (DLQ)
                  </div>
                  <div className="flex bg-slate-950 border border-slate-700 rounded overflow-hidden">
                    <button onClick={() => setDlqView('active')} className={`px-3 py-1 text-[10px] font-mono uppercase transition-colors ${dlqView === 'active' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>[ ACTIVE DLQ ]</button>
                    <button onClick={() => setDlqView('quarantined')} className={`px-3 py-1 text-[10px] font-mono uppercase border-l border-slate-700 transition-colors ${dlqView === 'quarantined' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>[ QUARANTINED ]</button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search DLQ..."
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-48 focus:outline-none focus:border-slate-500 font-mono"
                    value={dlqSearchQuery}
                    onChange={(e) => setDlqSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-5 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                 <div>Timestamp</div>
                 <div>Origin Node</div>
                 <div>Dropped Route</div>
                 <div>Error Reason</div>
                 <div>Action</div>
              </div>
            </div>

            <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
               {isLoading ? (
                  renderTelemetrySkeleton()
               ) : filteredDlq.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                     <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 max-w-lg w-full flex items-center gap-4">
                        <div className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <div className="text-slate-400 font-mono text-sm tracking-wider uppercase">[ SYSTEM INTEGRITY EXCELLENT: DEAD LETTER QUEUE VACANT ]</div>
                     </div>
                  </div>
               ) : (
                 filteredDlq.map((event, idx) => (
                   <div key={`${event.originNode || "origin"}-${event.timestamp}-${idx}`} className="grid grid-cols-5 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                     <div className="text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleString('en-GB')}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded text-xs border whitespace-nowrap text-amber-400 bg-amber-950/50 border-amber-900">
                          {event.originNode}
                        </span>
                        {event.status === "quarantined" && (
                           <span className="px-2 py-1 rounded text-xs border whitespace-nowrap text-amber-500 bg-amber-900/50 border-amber-500/50 font-bold">
                              [ QUARANTINED ]
                           </span>
                        )}
                     </div>
                     <div className="truncate text-slate-300">
                        {event.droppedRoute}
                     </div>
                     <div className="text-slate-400 truncate">
                        {event.errorReason}
                     </div>
                     <div className="text-right flex items-center justify-end gap-3">
                        <button
                           onClick={() => event.id && handleReplayPayload(event.id, event)}
                           disabled={event.id ? replayingState[event.id] : false}
                           className="text-amber-400 hover:text-amber-300 disabled:text-amber-700 disabled:cursor-not-allowed transition-colors text-[10px] font-semibold uppercase border border-transparent hover:border-amber-900 px-2 py-1 rounded">
                           {event.id && replayingState[event.id] ? "[ REPLAYING... ]" : "Replay"}
                        </button>
                        {event.status === "quarantined" && (
                          <button
                             onClick={() => event.id && handleUnquarantine(event.id)}
                             className="text-emerald-400 hover:text-emerald-300 transition-colors text-[10px] font-semibold uppercase border border-emerald-900/50 hover:bg-emerald-950/30 px-2 py-1 rounded">
                             [ UNQUARANTINE ]
                          </button>
                        )}
                        <button
                           onClick={() => event.id && handlePurgeDlqItem(event.id)}
                           className="text-red-400 hover:text-red-300 transition-colors text-[10px] font-semibold uppercase border border-red-900/50 hover:bg-red-950/30 px-2 py-1 rounded">
                           [ PURGE ]
                        </button>
                     </div>
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
