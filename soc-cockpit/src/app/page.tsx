import React from 'react';
import LiveThreatFeed from '@/components/LiveThreatFeed';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

const HomeFallback = () => (
  <div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500 max-w-lg w-full flex flex-col items-center gap-2 m-auto mt-20">
     <div className="uppercase tracking-wider text-red-500">Telemetry Disconnected</div>
     <div>Could not render active threat grid. Reconnecting...</div>
  </div>
);

export default function Home() {
  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>

        <div className="flex gap-4">
          <div className="text-xs bg-emerald-950/50 border border-emerald-900 px-3 py-1.5 rounded-md text-emerald-400 font-mono flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            INGEST: ONLINE
          </div>
          <div className="text-xs bg-cyan-950/50 border border-cyan-900 px-3 py-1.5 rounded-md text-cyan-400 font-mono flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            STREAM: CONNECTED
          </div>
          <div className="text-xs bg-slate-900/50 border border-slate-700 px-3 py-1.5 rounded-md text-slate-300 font-mono flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            AI LATENCY: <span className="text-emerald-400">84ms</span>
          </div>
        </div>

      </div>

      <ErrorBoundary FallbackComponent={HomeFallback}>
        <Suspense fallback={
<div className="flex-1 flex flex-col gap-6 overflow-hidden">
  {/* Filter Bar Skeleton */}
  <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-sm border border-slate-800 p-4 rounded-lg relative overflow-hidden h-[74px]">
    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
    <div className="flex gap-4">
      <div className="h-8 w-64 bg-slate-800/50 rounded animate-pulse"></div>
      <div className="h-8 w-40 bg-slate-800/50 rounded animate-pulse"></div>
      <div className="h-8 w-48 bg-slate-800/50 rounded animate-pulse"></div>
    </div>
    <div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse"></div>
  </div>

  <div className="flex flex-[2] gap-6 min-h-0 overflow-hidden">
    <div className="flex-[2] bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-0">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0 h-[53px]"></div>
      <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse h-[46px]"></div>
        ))}
      </div>
    </div>

    <div className="flex-[1] bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col min-h-0">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0 h-[53px]"></div>
      <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
         {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse h-[82px]"></div>
        ))}
      </div>
    </div>
  </div>
</div>}>
          <LiveThreatFeed />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
