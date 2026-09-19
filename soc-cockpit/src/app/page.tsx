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
        <Suspense fallback={<div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500">Loading Telemetry...</div>}>
          <LiveThreatFeed />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
