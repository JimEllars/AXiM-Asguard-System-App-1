'use client';
import LiveChat from "@/components/Stream/LiveChat";
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GlobalThreatMap from '@/components/Stream/GlobalThreatMap';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

const ThreatMapFallback = ({ error }: { error: any }) => (
  <div className="w-full h-full bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-center">
    <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
    <h3 className="text-lg font-bold text-slate-200">Map Visualization Unavailable</h3>
    <p className="text-sm text-slate-400 mt-2 max-w-md">The WebGL/Canvas context failed to initialize. Displaying tabular telemetry fallback instead.</p>
    <div className="mt-6 w-full max-w-lg border border-slate-800 rounded bg-slate-950 p-4">
      <div className="flex justify-between border-b border-slate-800 pb-2 mb-2 text-xs font-mono text-slate-500">
         <span>Time</span><span>Event Type</span><span>Source</span>
      </div>
      <div className="flex justify-between text-xs font-mono text-slate-300">
         <span>Just now</span><span className="text-amber-500">Render Fault</span><span>Local Client</span>
      </div>
    </div>
  </div>
);

export default function StreamPage() {

  const [isLive, setIsLive] = useState(true);
  const [attackVectors, setAttackVectors] = useState<{name: string, percentage: string, color: string}[]>([
    { name: 'DDoS', percentage: '42%', color: 'text-amber-500' },
    { name: 'Scrapers', percentage: '28%', color: 'text-blue-400' },
    { name: 'SQLi', percentage: '18%', color: 'text-red-400' },
    { name: 'Brute Force', percentage: '12%', color: 'text-purple-400' }
  ]);
  const [topCountries, setTopCountries] = useState<{code: string, count: string, color: string}[]>([
    { code: '🇷🇺 RU', count: '12,400', color: 'text-red-400' },
    { code: '🇨🇳 CN', count: '8,930', color: 'text-amber-400' },
    { code: '🇧🇷 BR', count: '4,120', color: 'text-blue-400' },
    { code: '🇺🇸 US', count: '2,850', color: 'text-slate-400' }
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabaseRef = useRef<any>(null);

  useEffect(() => {
    supabaseRef.current = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock-key');
  }, [supabaseUrl, supabaseKey]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !supabaseUrl || !supabaseKey) {
        setIsLive(false);
        return;
    }

    const fetchData = async () => {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabaseRef.current
                .from('threat_events')
                .select('threat_type, metadata')
                .gte('timestamp', twentyFourHoursAgo);

            if (data && data.length > 0) {
                const vectors: Record<string, number> = {};
                const countries: Record<string, number> = {};
                let totalVectors = 0;

                data.forEach((event: any) => {
                    const type = event.threat_type || 'Unknown';
                    vectors[type] = (vectors[type] || 0) + 1;
                    totalVectors++;

                    const country = event.metadata?.geo_country || 'XX';
                    countries[country] = (countries[country] || 0) + 1;
                });

                // Sort and map vectors
                const sortedVectors = Object.entries(vectors)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([name, count], index) => {
                        const colors = ['text-amber-500', 'text-blue-400', 'text-red-400', 'text-purple-400'];
                        return {
                            name,
                            percentage: ((count / totalVectors) * 100).toFixed(1) + '%',
                            color: colors[index % colors.length]
                        };
                    });
                if (sortedVectors.length > 0) setAttackVectors(sortedVectors);

                // Sort and map countries
                const getFlag = (code: string) => {
                    if (code === 'XX' || code === 'UNKNOWN') return '🌐 XX';
                    const codePoints = code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
                    return String.fromCodePoint(...codePoints) + ' ' + code.toUpperCase();
                };

                const sortedCountries = Object.entries(countries)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([code, count], index) => {
                        const colors = ['text-red-400', 'text-amber-400', 'text-blue-400', 'text-slate-400'];
                        return {
                            code: getFlag(code),
                            count: count.toLocaleString(),
                            color: colors[index % colors.length]
                        };
                    });
                if (sortedCountries.length > 0) setTopCountries(sortedCountries);
            }
        } catch (e) {
            console.error("Failed to fetch dynamic threat data", e);
        }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every minute

    return () => clearInterval(interval);
  }, [supabaseUrl, supabaseKey]);


  return (
    <div className="h-full p-6 flex flex-col gap-8 overflow-y-auto bg-slate-900 text-slate-50">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-blue-400">Asguard SOC Threat Command Stream & Incident Briefing</h2>
          <p className="text-slate-400 text-sm mt-1">Live Incident Stream & Threat Briefing Terminal.</p>
        </div>
        <div className={`text-xs px-3 py-1.5 rounded-md font-mono border ${isLive ? 'bg-emerald-950/50 border-emerald-900 text-emerald-400' : 'bg-red-950/50 border-red-900 text-red-400'}`}>
          STATUS: {isLive ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center justify-center">
          <h4 className="text-slate-500 uppercase tracking-widest text-xs mb-4">24H Attack Vectors</h4>

          {attackVectors.map((vector, i) => (
            <div key={i} className="w-full flex justify-between text-sm font-mono text-slate-300 mt-2 first:mt-0">
              <span>{vector.name}</span>
              <span className={`${vector.color} font-bold`}>{vector.percentage}</span>
            </div>
          ))}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center justify-center">
          <h4 className="text-slate-500 uppercase tracking-widest text-xs mb-4">Top Origin Countries</h4>

          <div className="w-full space-y-2">
            {topCountries.map((country, i) => (
                <div key={i} className="flex justify-between text-sm font-mono text-slate-300 border-b border-slate-800 pb-1 last:border-0 last:pb-0">
                  <span>{country.code}</span><span className={country.color}>{country.count}</span>
                </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center justify-center text-center">
          <h4 className="text-slate-500 uppercase tracking-widest text-xs mb-4">Edge KV Cache Hit Rate</h4>
          <div className="text-5xl font-mono font-bold text-emerald-400 mb-2">99.8%</div>
          <div className="text-xs text-slate-400 font-mono tracking-widest">SUB-5MS EDGE EVALUATIONS</div>
          <div className="mt-4 w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
             <div className="bg-emerald-500 h-full" style={{ width: '99.8%' }}></div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-4 mt-6">
        <div className="col-span-1 xl:col-span-2 h-[380px] md:h-[460px] xl:h-[540px]">
        <ErrorBoundary FallbackComponent={ThreatMapFallback}>
          <Suspense fallback={<div className="h-full bg-slate-900 border border-slate-700 rounded-xl">Loading Map...</div>}>
            <GlobalThreatMap />
          </Suspense>
        </ErrorBoundary>
        </div>
        <div className="w-full h-[400px] xl:h-full shrink-0">
          <Suspense fallback={<div className="h-full bg-slate-900 border border-slate-700 rounded-xl">Loading Chat...</div>}>
            <LiveChat isAuthenticated={true} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
