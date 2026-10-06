
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

export function LiveThreatFeed() {
  const [mounted, setMounted] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [packetLatency, setPacketLatency] = useState(0);
  const [streamedAttacks, setStreamedAttacks] = useState<any[]>([]);
  const [telemetryPage, setTelemetryPage] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [appOrigin, setAppOrigin] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [blocklist, setBlocklist] = useState<any[]>([]);

  const itemsPerPage = 5;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabaseRef = useRef<any>(null);

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

    const channel = supabaseRef.current
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'threat_events',
        },
        (payload: any) => {
          setStreamedAttacks((prev) => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe((status: any) => {
         if (status === 'SUBSCRIBED') {
            setStreamConnected(true);
         } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setStreamConnected(false);
         }
      });

    return () => {
      if (supabaseRef.current) {
        supabaseRef.current.removeChannel(channel);
      }
    };
  }, [mounted, supabaseUrl, supabaseKey]);

  const handleDropIp = async (ip: string) => {
     // call /api/asguard/blocklist
  };

  const handleUnblockIp = async (ip: string) => {
     // unblock
  };

  if (!mounted) {
     return <div className="p-4 bg-[#0B0F19] text-slate-300 font-mono">Loading Threat Feed...</div>;
  }

  const filteredAttacks = streamedAttacks.filter(a => {
     const matchesSearch = (a.source_ip || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (a.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (a.threat_type || '').toLowerCase().includes(searchTerm.toLowerCase());
     const matchesSeverity = severityFilter === 'ALL' || (a.severity || '').toUpperCase() === severityFilter;
     // Add origin filtering if available on model
     return matchesSearch && matchesSeverity;
  });

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
              <div className="text-xs text-slate-500 mb-1">Node Latency Target</div>
              <div className="text-2xl font-bold text-slate-200">&lt; 5ms</div>
              <div className="text-xs text-emerald-500">Avg Edge Execution</div>
           </div>
        </div>

        {/* Edge Trend Analytics Placeholder */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
           <div className="bg-[#111827] border border-slate-800 p-2 rounded">
              <div className="font-bold text-slate-400 mb-2">Top Datacenters</div>
              <div>SFO - 45%</div>
              <div>FRA - 25%</div>
           </div>
           <div className="bg-[#111827] border border-slate-800 p-2 rounded">
              <div className="font-bold text-slate-400 mb-2">Top Regional Sources</div>
              <div>US - 50%</div>
              <div>DE - 20%</div>
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
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {filteredAttacks.length === 0 ? (
                     <div className="text-slate-500 text-sm text-center mt-10">No recent threats detected.</div>
                  ) : (
                     filteredAttacks.slice(telemetryPage * itemsPerPage, (telemetryPage + 1) * itemsPerPage).map((attack, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-700 p-2 rounded text-xs flex flex-col gap-2">
                           <div className="flex justify-between items-center">
                              <div>
                                 <div className="font-bold text-slate-200">{((attack.subject || "") || (attack.threat_type || "") || 'Unknown Threat').toUpperCase()}</div>
                                 <div className="text-slate-500">{new Date(attack.timestamp).toLocaleString()} | {attack.source_ip}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className={"px-2 py-1 rounded text-white " + (attack.verdict === 'block' ? 'bg-red-600' : attack.verdict === 'quarantine' ? 'bg-amber-600' : 'bg-emerald-600')}>
                                    {(attack.verdict || 'UNKNOWN').toUpperCase()}
                                 </div>
                                 <button onClick={() => handleDropIp(attack.source_ip)} className="bg-[#FDD023] text-black px-2 py-1 rounded hover:bg-yellow-400">
                                    Drop IP
                                 </button>
                              </div>
                           </div>
                           <details className="cursor-pointer text-slate-400 mt-1">
                              <summary className="hover:text-slate-200">Inspect JSON</summary>
                              <div className="mt-2 bg-black p-2 rounded overflow-auto max-h-32 border border-slate-800 relative">
                                 <button className="absolute top-2 right-2 text-slate-500 hover:text-white" onClick={() => navigator.clipboard.writeText(JSON.stringify(attack, null, 2))}>Copy</button>
                                 <pre className="text-[10px]">
                                    {JSON.stringify({...attack, authorization: '[ REDACTED_FOR_COMPLIANCE ]'}, null, 2)}
                                 </pre>
                              </div>
                           </details>
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
                  <div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500 flex flex-col h-full items-center justify-center">
                      No active perimeter blocks.
                  </div>
              </div>
           </div>

        </div>

        {/* Bottom Pane: Audit Trail Placeholder */}
        <div className="h-32 bg-[#111827] border border-slate-800 rounded flex flex-col">
           <div className="p-2 border-b border-slate-800 font-bold text-sm flex justify-between">
              Audit Trail
              <button className="text-xs text-[#FDD023] hover:underline">Export JSON</button>
           </div>
           <div className="flex-1 overflow-y-auto p-2 text-xs text-slate-400 text-center flex items-center justify-center">
              End of audit trail.
           </div>
        </div>

    </div>
  );
}
