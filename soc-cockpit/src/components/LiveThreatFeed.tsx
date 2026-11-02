
"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

/** Reconnect backoff envelope for the realtime feed. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/** Latency thresholds for the stream health badge, in milliseconds. */
const LATENCY_LIVE_MS = 2000;
const LATENCY_LAGGING_MS = 10000;

type LatencyClass = 'live' | 'lagging' | 'stalled' | 'offline';

/** Coerce anything into a displayable string without ever throwing. */
function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() ? value : fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

/** Format an epoch/ISO timestamp, tolerating null and unparseable input. */
function formatTimestamp(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

/** Millisecond value of a timestamp, or null when it cannot be parsed. */
function timestampMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function latencyClassFor(ms: number, connected: boolean): LatencyClass {
  if (!connected) return 'offline';
  if (ms <= LATENCY_LIVE_MS) return 'live';
  if (ms <= LATENCY_LAGGING_MS) return 'lagging';
  return 'stalled';
}

const LATENCY_BADGE: Record<LatencyClass, { label: string; dot: string; text: string }> = {
  live: { label: 'LIVE', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  lagging: { label: 'LAGGING', dot: 'bg-amber-500', text: 'text-amber-400' },
  stalled: { label: 'STALLED', dot: 'bg-red-500', text: 'text-red-400' },
  offline: { label: 'OFFLINE', dot: 'bg-slate-500', text: 'text-slate-400' },
};

export function LiveThreatFeed() {
  const [mounted, setMounted] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [packetLatency, setPacketLatency] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [streamedAttacks, setStreamedAttacks] = useState<any[]>([]);
  const [eventsPerSecond, setEventsPerSecond] = useState(0);
  const eventsInLastSecond = useRef(0);
  const autoRefreshRef = useRef(false);
  const [telemetryPage, setTelemetryPage] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [appOrigin, setAppOrigin] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [blocklist, setBlocklist] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [selectedThreat, setSelectedThreat] = useState<any | null>(null);

  const itemsPerPage = 5;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabaseRef = useRef<any>(null);
  const lastEventTimestamp = useRef<number | null>(null);
  /** Set inside the subscription effect so the UI can force a reconnect. */
  const reconnectNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    supabaseRef.current = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock-key');
    setMounted(true);
  }, [supabaseUrl, supabaseKey]);

  useEffect(() => {
    if (!mounted || !supabaseRef.current) return;

    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !supabaseUrl || !supabaseKey) {
        setStreamConnected(true);
        const interval = setInterval(() => {
            setStreamedAttacks(prev => {
                return [{
                   id: Math.random().toString(36),
                   timestamp: new Date().toISOString(),
                   subject: 'Mock Phishing',
                   verdict: 'block',
                   threat_score: 99.5,
                   source_ip: '192.168.1.1',
                   threat_type: 'API',
                   severity: 'CRITICAL',
                   metadata: { colo: 'SFO', geo_country: 'US' }
                }, ...prev].slice(0, 100);
            });
        }, 3000);
        return () => clearInterval(interval);
    }

    const fetchBlocklist = async () => {
      try {
        const res = await fetch('/api/asguard/blocklist');
        if (res.ok) {
          const data = await res.json();
          setBlocklist(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.warn('Failed to fetch edge blocklist:', err);
      }
    };

    const fetchAuditEvents = async () => {
      try {
        const res = await fetch('/api/asguard/audit');
        if (res.ok) {
          const data = await res.json();
          setAuditEvents(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.warn('Failed to fetch edge audit logs:', err);
      }
    };

    fetchBlocklist();
    fetchAuditEvents();

    let disposed = false;
    let channel: any = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const recordEvent = (event: any) => {
      eventsInLastSecond.current += 1;

      const eventMs = timestampMs(event?.timestamp);
      if (eventMs !== null) {
        lastEventTimestamp.current = Math.max(lastEventTimestamp.current ?? 0, eventMs);
        // Delivery lag = wall clock now minus the time the edge stamped it.
        const lag = Date.now() - eventMs;
        setPacketLatency(Math.max(0, Math.min(lag, 60000)));
      }
    };

    const fetchMissedEvents = async () => {
      if (!lastEventTimestamp.current) return;
      try {
        const { data } = await supabaseRef.current
          .from('threat_events')
          .select('*')
          .gt('timestamp', new Date(lastEventTimestamp.current).toISOString())
          .order('timestamp', { ascending: false })
          .limit(50);
        if (data && data.length > 0) {
          setStreamedAttacks(prev => {
            const existingIds = new Set(prev.map(item => item?.id));
            const uniqueNew = data.filter((item: any) => !existingIds.has(item?.id));
            return [...uniqueNew, ...prev].slice(0, 100);
          });
        }
      } catch (e) {
        console.warn('Gap recovery fetch failed softly:', e);
      }
    };

    const teardownChannel = () => {
      if (!channel) return;
      try {
        supabaseRef.current.removeChannel(channel);
      } catch (e) {
        console.warn('Channel teardown failed softly:', e);
      }
      channel = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      // 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
      attempt += 1;
      setReconnectAttempt(attempt);
      console.warn(`Threat feed disconnected; reconnecting in ${delay}ms (attempt ${attempt})`);

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (disposed) return;
        teardownChannel();
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;

      // A distinct channel name per attempt, otherwise Supabase hands back the
      // already-closed channel and the subscribe callback never fires again.
      channel = supabaseRef.current
        .channel(`schema-db-changes-${attempt}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'threat_events' },
          (payload: any) => {
            recordEvent(payload?.new);
            setStreamedAttacks((prev) => [payload?.new, ...prev].slice(0, 100));
          },
        )
        .subscribe((status: string) => {
          if (disposed) return;

          if (status === 'SUBSCRIBED') {
            attempt = 0;
            setReconnectAttempt(0);
            setStreamConnected(true);
            void fetchMissedEvents();
            return;
          }

          if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setStreamConnected(false);
            scheduleReconnect();
          }
        });
    };

    const forceReconnect = () => {
      if (disposed) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setStreamConnected(false);
      teardownChannel();
      attempt = 0;
      setReconnectAttempt(0);
      connect();
    };

    reconnectNowRef.current = forceReconnect;
    connect();

    const epsInterval = setInterval(() => {
      setEventsPerSecond(eventsInLastSecond.current);
      eventsInLastSecond.current = 0;
    }, 1000);

    // Staleness watchdog: with no inbound events the latency figure would sit
    // at its last value forever, so age it forward every heartbeat.
    const stalenessInterval = setInterval(() => {
      if (!lastEventTimestamp.current) return;
      const lag = Math.max(0, Math.min(Date.now() - lastEventTimestamp.current, 60000));
      setPacketLatency(lag);
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(epsInterval);
      clearInterval(stalenessInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectNowRef.current = () => {};
      teardownChannel();
    };
  }, [mounted, supabaseUrl, supabaseKey]);

  const handleDropIp = useCallback(async (ip: string, reason?: string) => {
    if (!ip) return;
    try {
      const res = await fetch('/api/asguard/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: `ip:${ip}`,
          action: 'block',
          ttl: 86400,
          note: reason || 'Manual drop from SOC Cockpit'
        })
      });
      if (res.ok) {
        try {
          const bRes = await fetch('/api/asguard/blocklist');
          if (bRes.ok) {
            const data = await bRes.json();
            setBlocklist(Array.isArray(data) ? data : []);
          }
        } catch(e) {}
      }
    } catch (err) {
      console.error('Failed to block IP at edge:', err);
    }
  }, []);

  const handleUnblockIp = async (key: string) => {
    try {
      const res = await fetch('/api/asguard/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.startsWith('ip:') ? key : `ip:${key}`,
          action: 'unblock'
        })
      });
      if (res.ok) {
        try {
          const bRes = await fetch('/api/asguard/blocklist');
          if (bRes.ok) {
            const data = await bRes.json();
            setBlocklist(Array.isArray(data) ? data : []);
          }
        } catch(e) {}
      }
    } catch (err) {
      console.error('Failed to lift block at edge:', err);
    }
  };


  const handlePurgeExpired = async () => {
    try {
      const res = await fetch('/api/asguard/blocklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge_expired' })
      });
      if (res.ok) {
        try {
          const bRes = await fetch('/api/asguard/blocklist');
          if (bRes.ok) {
            const data = await bRes.json();
            setBlocklist(data.data || []);
          }
        } catch (err) {}
      }
    } catch (err) {
      console.error('Failed to purge expired blocks:', err);
    }
  };

  if (!mounted) {
     return <div className="p-4 bg-[#0B0F19] text-slate-300 font-mono">Loading Threat Feed...</div>;
  }

  const latencyClass = latencyClassFor(packetLatency ?? 0, streamConnected);
  const latencyBadge = LATENCY_BADGE[latencyClass];

  const filteredAttacks = streamedAttacks.filter(a => {
     if (!a || typeof a !== 'object') return false;

     const haystack = [a.source_ip, a.subject, a.threat_type, a.details?.message]
        .map(v => asText(v).toLowerCase())
        .join(' ');
     const needle = searchTerm.toLowerCase();
     const matchesSearch = !needle || haystack.includes(needle);

     const matchesSeverity = severityFilter === 'ALL' ||
        asText(a.severity).toUpperCase() === severityFilter;

     const originHaystack = [a.appOrigin, a.app_origin, a.metadata?.appOrigin, a.threat_type]
        .map(v => asText(v).toLowerCase())
        .join(' ');
     const matchesOrigin = appOrigin === 'ALL' || originHaystack.includes(appOrigin.toLowerCase());

     return matchesSearch && matchesSeverity && matchesOrigin;
  });

  const coloCounts = streamedAttacks.reduce((acc, curr) => {
      const c = asText(curr?.metadata?.colo, 'EDGE');
      acc[c] = (acc[c] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);
  const sortedColos = Object.entries(coloCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 2);
  const totalColoCount = streamedAttacks.length || 1;

  const countryCounts = streamedAttacks.reduce((acc, curr) => {
      const c = asText(curr?.metadata?.geo_country ?? curr?.country, 'US');
      acc[c] = (acc[c] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);
  const sortedCountries = Object.entries(countryCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 2);
  const totalCountryCount = streamedAttacks.length || 1;

  const handleExportAudit = () => {
      const blob = new Blob([JSON.stringify(auditEvents, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'asguard-audit-export.json';
      a.click();
      URL.revokeObjectURL(url);
  };


  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded p-4 text-slate-300 font-mono flex flex-col h-full overflow-hidden">

        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
           <div className="bg-[#111827] border border-slate-800 p-4 rounded text-center">
              <div className="text-xs text-slate-500 mb-1">Ingested Alerts</div>
              <div className="text-2xl font-bold text-slate-200">{streamedAttacks.length}</div>
              <div className="text-xs text-[#FDD023]">Expanding</div>
           </div>
           <div className="bg-[#111827] border border-slate-800 p-4 rounded text-center">
              <div className="text-xs text-slate-500 mb-1">Active Edge Drops</div>
              <div className="text-2xl font-bold text-slate-200">{blocklist.length}</div>
              <div className="text-xs text-red-500">Active Mitigation</div>
           </div>
           <div className="bg-[#111827] border border-slate-800 p-4 rounded text-center">
              <div className="text-xs text-slate-500 mb-1">Stream Latency</div>
              <div className={"text-2xl font-bold " + latencyBadge.text}>
                 {streamConnected ? (packetLatency === null ? '—' : `${packetLatency}ms`) : '—'}
              </div>
              <div className="flex items-center justify-center gap-2 text-xs">
                 <span className={"inline-block w-2 h-2 rounded-full " + latencyBadge.dot} aria-hidden="true"></span>
                 <span className={latencyBadge.text}>{latencyBadge.label}</span>
              </div>
           </div>
        </div>

        {/* Edge Trend Analytics Placeholder */}
        <div className="grid grid-cols-3 gap-4 mb-4 text-xs">
           <div className="bg-[#111827] border border-slate-800 p-2 rounded flex flex-col justify-center items-center">
               <div className="text-2xl font-bold text-[#FDD023]">{eventsPerSecond}</div>
               <div className="text-xs text-slate-500">events/sec</div>
           </div>
           <div className="bg-[#111827] border border-slate-800 p-2 rounded">
              <div className="font-bold text-slate-400 mb-2">Top Datacenters</div>
              {sortedColos.length > 0 ? sortedColos.map(([colo, count]) => (
                  <div key={colo} className="cursor-pointer hover:text-white" onClick={() => setSearchTerm(colo)}>
                      {colo} - {Math.round(((count as number) / totalColoCount) * 100)}%
                  </div>
              )) : <div>No data</div>}
           </div>
           <div className="bg-[#111827] border border-slate-800 p-2 rounded">
              <div className="font-bold text-slate-400 mb-2">Top Regional Sources</div>
              {sortedCountries.length > 0 ? sortedCountries.map(([country, count]) => (
                  <div key={country} className="cursor-pointer hover:text-white" onClick={() => setSearchTerm(country)}>
                      {country} - {Math.round(((count as number) / totalCountryCount) * 100)}%
                  </div>
              )) : <div>No data</div>}
           </div>
        </div>

        {/* Search & Multi-Filter Bar */}
        <div className="flex gap-2 mb-4">
           <input
              type="text"
              placeholder="Search IP, Signature, Details..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-[#1F2937] border border-slate-700 p-2 rounded text-xs flex-1 text-slate-200"
           />
           <select
              value={appOrigin}
              onChange={e => setAppOrigin(e.target.value)}
              className="bg-[#1F2937] border border-slate-700 p-2 rounded text-xs text-slate-200"
           >
              <option value="ALL">ALL Origins</option>
              <option value="VendOS">VendOS</option>
              <option value="B2B Scrapers">B2B Scrapers</option>
              <option value="CRM Bridge">CRM Bridge</option>
              <option value="AXiM Academy">AXiM Academy</option>
              <option value="AXiM Macro Core Gateway">AXiM Macro Core Gateway</option>
           </select>
           <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="bg-[#1F2937] border border-slate-700 p-2 rounded text-xs text-slate-200"
           >
              <option value="ALL">ALL Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="INFO">INFO</option>
           </select>
        </div>

        {/* Split Cockpit Layout */}
        <div className="flex-1 flex gap-4 overflow-hidden mb-4">

           {/* Left Pane: Telemetry Grid */}
           <div className="flex-1 bg-[#111827] border border-slate-800 rounded flex flex-col overflow-hidden">
              <div className="p-2 border-b border-slate-800 font-bold text-sm flex items-center gap-2">
                 <span className={"w-2 h-2 rounded-full " + (streamConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')}></span>
                 Telemetry Grid
                 <span className={"ml-auto text-[10px] font-normal px-2 py-0.5 rounded border border-slate-700 " + latencyBadge.text}>
                    {streamConnected ? latencyBadge.label : `OFFLINE${reconnectAttempt > 0 ? ` · retry ${reconnectAttempt}` : ''}`}
                 </span>
                 {!streamConnected && (
                    <button
                       onClick={() => reconnectNowRef.current()}
                       className="text-[10px] font-normal px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500 hover:text-slate-100"
                    >
                       Reconnect
                    </button>
                 )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {filteredAttacks.length === 0 ? (
                     <div className="text-slate-500 text-sm text-center mt-10">No recent threats detected.</div>
                  ) : (
                     filteredAttacks.slice(telemetryPage * itemsPerPage, (telemetryPage + 1) * itemsPerPage).map((attack, idx) => (
                        <div key={asText(attack?.id) || idx} className="bg-slate-900 border border-slate-700 p-2 rounded text-xs flex flex-col gap-2 cursor-pointer hover:border-slate-500 transition-colors" onClick={() => setSelectedThreat(attack)}>
                           <div className="flex justify-between items-center">
                              <div>
                                 <div className="font-bold text-slate-200">{asText(attack?.subject, asText(attack?.threat_type, 'Unknown Threat')).toUpperCase()}</div>
                                 <div className="text-slate-500">{formatTimestamp(attack?.timestamp)} | {asText(attack?.source_ip, 'unknown')}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className={"px-2 py-1 rounded text-white " + (attack?.verdict === 'block' ? 'bg-red-600' : attack?.verdict === 'quarantine' ? 'bg-amber-600' : 'bg-emerald-600')}>
                                    {asText(attack?.verdict, 'UNKNOWN').toUpperCase()}
                                 </div>
                                 <button onClick={() => handleDropIp(asText(attack?.source_ip))} disabled={!asText(attack?.source_ip)} className="bg-[#FDD023] text-black px-2 py-1 rounded hover:bg-yellow-400 disabled:opacity-40">
                                    Drop IP
                                 </button>
                              </div>
                           </div>

                        </div>
                     ))
                  )}
              </div>
              <div className="p-2 border-t border-slate-800 flex justify-between items-center">
                 <button
                    disabled={telemetryPage === 0}
                    onClick={() => setTelemetryPage(p => Math.max(0, p - 1))}
                    className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
                 >
                   &larr; Prev
                 </button>
                 <span className="text-xs text-slate-500">Page {telemetryPage + 1}</span>
                 <button
                    disabled={(telemetryPage + 1) * itemsPerPage >= filteredAttacks.length}
                    onClick={() => setTelemetryPage(p => p + 1)}
                    className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
                 >
                   Next &rarr;
                 </button>
              </div>
           </div>

           {/* Right Pane: Active Perimeter Blocks */}
           <div className="w-1/3 bg-[#111827] border border-slate-800 rounded flex flex-col overflow-hidden">
              <div className="p-2 border-b border-slate-800 font-bold text-sm">Active Perimeter Blocks</div>
              <div className="flex-1 overflow-y-auto p-2">
                  {blocklist.length === 0 ? (
                  <div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500 flex flex-col h-full items-center justify-center">
                      No active perimeter blocks.
                  </div>
                  ) : (
                      <div className="space-y-2">
                          {blocklist.map((block, idx) => {
                              const blockKey = asText(block?.key, asText(block?.ip, 'Unknown'));
                              return (
                              <div key={blockKey + idx} className="bg-slate-900 border border-slate-700 p-2 rounded text-xs flex flex-col gap-1">
                                  <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-200">{blockKey}</span>
                                      <button onClick={() => handleUnblockIp(blockKey)} className="bg-slate-800 text-xs px-2 py-1 rounded hover:bg-slate-700">
                                          Lift Block
                                      </button>
                                  </div>
                                  <div className="text-slate-500 text-[10px]">
                                      Expires: {block?.expiration ? formatTimestamp(block.expiration * 1000) : 'Never'}
                                  </div>
                                  {asText(block?.note) && <div className="text-amber-500 text-[10px]">Note: {asText(block?.note)}</div>}
                              </div>
                              );
                          })}
                      </div>
                  )}
              </div>
           </div>

        </div>

        {/* Bottom Pane: Audit Trail Placeholder */}
        <div className="h-32 bg-[#111827] border border-slate-800 rounded flex flex-col">
           <div className="p-2 border-b border-slate-800 font-bold text-sm flex justify-between">
              Audit Trail
              <button onClick={handleExportAudit} className="text-xs text-[#FDD023] hover:underline">Export JSON</button>
           </div>
           <div className="flex-1 overflow-y-auto p-2 text-xs text-slate-400 text-center flex items-center justify-center">
               {auditEvents.length === 0 ? (
                  <span>End of audit trail.</span>
               ) : (
                  <div className="w-full h-full space-y-1 text-left">
                     {auditEvents.map((evt, idx) => (
                         <div key={idx} className="border-b border-slate-800/50 pb-1">
                             <span className="text-slate-500">{formatTimestamp(evt?.timestamp ?? Date.now())}</span> -
                             <span className={"font-bold mx-1 " + (evt?.action === 'block' ? 'text-red-500' : 'text-emerald-500')}>{asText(evt?.action, 'unknown').toUpperCase()}</span> -
                             <span className="text-slate-200">{asText(evt?.target, asText(evt?.key, 'Unknown'))}</span>
                         </div>
                     ))}
                  </div>
               )}
           </div>
        </div>


        {/* Threat Triage Slide-Out Panel */}
        {selectedThreat && (
          <div className="absolute top-0 right-0 w-[400px] h-full bg-[#111827] border-l border-slate-700 shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-[#0B0F19]">
              <div className="flex items-center gap-3">
                <div className={`px-2 py-1 rounded text-[10px] font-bold text-white ${selectedThreat?.severity === 'CRITICAL' ? 'bg-red-600' : selectedThreat?.severity === 'HIGH' ? 'bg-orange-500' : 'bg-slate-600'}`}>
                  {asText(selectedThreat?.severity, 'INFO').toUpperCase()}
                </div>
                <h2 className="font-bold text-slate-200 text-sm truncate max-w-[200px]">
                  {asText(selectedThreat?.subject, asText(selectedThreat?.threat_type, 'Unknown Threat')).toUpperCase()}
                </h2>
              </div>
              <button onClick={() => setSelectedThreat(null)} className="text-slate-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

              {/* Overview */}
              <div>
                <h3 className="text-[#FDD023] text-xs font-bold mb-2 uppercase tracking-wider">Overview</h3>
                <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timestamp</span>
                    <span className="text-slate-300">{formatTimestamp(selectedThreat?.timestamp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Source IP</span>
                    <span className="text-slate-300 font-mono">{asText(selectedThreat?.source_ip, 'unknown')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination</span>
                    <span className="text-slate-300">{asText(selectedThreat?.target_path, asText(selectedThreat?.host, 'Unknown'))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verdict</span>
                    <span className="text-slate-300 capitalize">{asText(selectedThreat?.verdict, 'Unknown')}</span>
                  </div>
                </div>
              </div>

              {/* Geolocation */}
              <div>
                <h3 className="text-[#FDD023] text-xs font-bold mb-2 uppercase tracking-wider">Geolocation</h3>
                <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Location</span>
                    <span className="text-slate-300">
                      {((asText(selectedThreat?.metadata?.geo_city) || '') + (asText(selectedThreat?.metadata?.geo_city) && asText(selectedThreat?.metadata?.geo_country) ? ', ' : '') + (asText(selectedThreat?.metadata?.geo_country) || '') + (asText(selectedThreat?.metadata?.colo) ? ` (${asText(selectedThreat.metadata.colo)})` : '')) || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures & Indicators */}
              <div>
                <h3 className="text-[#FDD023] text-xs font-bold mb-2 uppercase tracking-wider">Signatures & Indicators</h3>
                <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs">
                  {selectedThreat?.details?.ruleMatches?.length > 0 || selectedThreat?.indicators?.length > 0 ? (
                    <ul className="list-disc list-inside text-slate-300 space-y-1">
                      {(selectedThreat?.details?.ruleMatches || selectedThreat?.indicators || []).map((rule: string, i: number) => (
                        <li key={i}>{asText(rule, 'unspecified')}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-500">No specific signatures matched.</span>
                  )}
                </div>
              </div>

              {/* Token Usage (if applicable) */}
              {selectedThreat?.details?.prompt_cache_hit_tokens !== undefined && (
                <div>
                   <h3 className="text-[#FDD023] text-xs font-bold mb-2 uppercase tracking-wider">AI Analysis Details</h3>
                   <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs space-y-2">
                     <div className="flex justify-between">
                       <span className="text-slate-500">Prompt Cache Tokens</span>
                       <span className="text-slate-300">{selectedThreat?.details?.prompt_cache_hit_tokens}</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-slate-500">Cache Hit Ratio</span>
                       <span className="text-slate-300">{typeof selectedThreat?.details?.prompt_cache_hit_ratio === 'number' ? selectedThreat.details.prompt_cache_hit_ratio.toFixed(2) : '0'}%</span>
                     </div>
                   </div>
                </div>
              )}

            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-slate-800 bg-[#0B0F19] flex gap-3">
              <button
                onClick={() => {
                  handleDropIp(asText(selectedThreat?.source_ip));
                  setSelectedThreat(null);
                }}
                disabled={!asText(selectedThreat?.source_ip)}
                className="flex-1 bg-[#FDD023] text-black text-xs font-bold py-2 rounded hover:bg-yellow-400 transition-colors disabled:opacity-40"
              >
                Drop IP
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify({...selectedThreat, authorization: '[ REDACTED_FOR_COMPLIANCE ]'}, null, 2))}
                className="flex-1 bg-slate-800 text-white text-xs font-bold py-2 rounded border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                Copy Raw JSON
              </button>
            </div>
          </div>
        )}
</div>
  );
}
