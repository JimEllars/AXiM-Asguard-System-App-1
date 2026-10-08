'use client';
import LiveChat from "@/components/Stream/LiveChat";
import React, { useState, useEffect } from 'react';
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
  const [isLive] = useState(true);

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
          <div className="w-full flex justify-between text-sm font-mono text-slate-300">
            <span>DDoS</span>
            <span className="text-amber-500 font-bold">42%</span>
          </div>
          <div className="w-full flex justify-between text-sm font-mono text-slate-300 mt-2">
            <span>Scrapers</span>
            <span className="text-blue-400 font-bold">28%</span>
          </div>
          <div className="w-full flex justify-between text-sm font-mono text-slate-300 mt-2">
            <span>SQLi</span>
            <span className="text-red-400 font-bold">18%</span>
          </div>
          <div className="w-full flex justify-between text-sm font-mono text-slate-300 mt-2">
            <span>Brute Force</span>
            <span className="text-purple-400 font-bold">12%</span>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center justify-center">
          <h4 className="text-slate-500 uppercase tracking-widest text-xs mb-4">Top Origin Countries</h4>
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm font-mono text-slate-300 border-b border-slate-800 pb-1">
              <span>🇷🇺 RU</span><span className="text-red-400">12,400</span>
            </div>
            <div className="flex justify-between text-sm font-mono text-slate-300 border-b border-slate-800 pb-1">
              <span>🇨🇳 CN</span><span className="text-amber-400">8,930</span>
            </div>
            <div className="flex justify-between text-sm font-mono text-slate-300 border-b border-slate-800 pb-1">
              <span>🇧🇷 BR</span><span className="text-blue-400">4,120</span>
            </div>
            <div className="flex justify-between text-sm font-mono text-slate-300">
              <span>🇺🇸 US</span><span className="text-slate-400">2,850</span>
            </div>
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
